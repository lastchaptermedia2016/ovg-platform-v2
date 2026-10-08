-- Bulletproof dedup guard for appointment-lead upserts.
--
-- WHY: `upsertAppointmentLead` (src/lib/booking/lead-dedup.ts) is a
-- check-then-act SELECT followed by INSERT. Two concurrent chat requests
-- (send-anon + visitor-memories, or a double-submit) can both observe zero
-- rows and both INSERT, producing duplicate LEAD dashboard rows for the
-- same tenant + phone. A non-unique index cannot prevent this — only a
-- UNIQUE constraint serializes concurrent inserts at the database level.
--
-- ORDER OF OPERATIONS (each step idempotent / re-runnable):
--   1. Merge grandfathered duplicate active LEADs: partition by
--      tenant_id + digit-normalized phone, keep the earliest row, and port
--      a real name / specific intent from the losers onto the winner when
--      the winner only has a fallback name or generic intent.
--   2. Normalize stored LEAD phones to digits-only. The unique index keys
--      on the raw string, so '+2782…' and '2782…' are different keys and
--      would both slip past the guard. Normalizing first removes the
--      mismatch (step 1 already merged any same-digit pairs, so this can
--      never collide).
--   3. Create the partial UNIQUE index on (tenant_id, client_phone)
--      restricted to active leads (`status = 'LEAD'`, non-null phone).
--      CONTACTED and ARCHIVED rows are terminal CRM states excluded from
--      the predicate, so a contacted/archived lead never blocks a fresh
--      LEAD for the same phone. Name-only rows (`client_phone IS NULL`)
--      are excluded by the predicate.

-- ── 1. Merge grandfathered duplicates ──────────────────────────────────────
-- A "real" name is anything that isn't empty, a `Visitor …` label, or an
-- `Anonymous …` label; a "generic" intent is empty or the default
-- 'Public widget inquiry' both capture paths write.
WITH ranked AS (
  SELECT
    id,
    tenant_id,
    client_name,
    initial_intent,
    regexp_replace(client_phone, '\D', '', 'g') AS phone_digits,
    ROW_NUMBER() OVER (
      PARTITION BY tenant_id, regexp_replace(client_phone, '\D', '', 'g')
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM tenant_appointments
  WHERE status = 'LEAD'
    AND client_phone IS NOT NULL
),
winner_rows AS (
  SELECT * FROM ranked WHERE rn = 1
),
loser_facts AS (
  SELECT
    tenant_id,
    phone_digits,
    -- Latest real name among the losers (rn DESC = newest first).
    (array_agg(client_name ORDER BY rn DESC)
       FILTER (WHERE btrim(coalesce(client_name, '')) <> ''
                 AND client_name !~* '^(visitor\b|anonymous)'))[1]
      AS best_loser_name,
    (array_agg(initial_intent ORDER BY rn DESC)
       FILTER (WHERE btrim(coalesce(initial_intent, '')) <> ''
                 AND lower(btrim(initial_intent)) <> 'public widget inquiry'))[1]
      AS best_loser_intent
  FROM ranked
  WHERE rn > 1
  GROUP BY tenant_id, phone_digits
),
merged AS (
  UPDATE tenant_appointments AS t
  SET
    client_name = CASE
      WHEN btrim(coalesce(w.client_name, '')) = ''
         OR w.client_name ~* '^(visitor\b|anonymous)'
      THEN coalesce(lf.best_loser_name, w.client_name)
      ELSE w.client_name
    END,
    initial_intent = CASE
      WHEN btrim(coalesce(w.initial_intent, '')) = ''
         OR lower(btrim(w.initial_intent)) = 'public widget inquiry'
      THEN coalesce(lf.best_loser_intent, w.initial_intent)
      ELSE w.initial_intent
    END
  FROM winner_rows AS w
  JOIN loser_facts AS lf
    ON lf.tenant_id = w.tenant_id
   AND lf.phone_digits = w.phone_digits
  WHERE t.id = w.id
    AND (
      (
        (btrim(coalesce(w.client_name, '')) = ''
          OR w.client_name ~* '^(visitor\b|anonymous)')
        AND lf.best_loser_name IS NOT NULL
      )
      OR (
        (btrim(coalesce(w.initial_intent, '')) = ''
          OR lower(btrim(w.initial_intent)) = 'public widget inquiry')
        AND lf.best_loser_intent IS NOT NULL
      )
    )
  RETURNING t.id
),
deleted AS (
  DELETE FROM tenant_appointments
  USING ranked
  WHERE tenant_appointments.id = ranked.id
    AND ranked.rn > 1
  RETURNING tenant_appointments.id
)
SELECT (SELECT count(*) FROM merged) AS merged_winners,
       (SELECT count(*) FROM deleted) AS deleted_losers;

-- ── 2. Normalize LEAD phones to digits-only ────────────────────────────────
-- Re-runnable: the predicate only matches rows still carrying a
-- non-digit character.
UPDATE tenant_appointments
SET client_phone = regexp_replace(client_phone, '\D', '', 'g')
WHERE status = 'LEAD'
  AND client_phone IS NOT NULL
  AND client_phone ~ '\D';

-- ── 3. Partial unique index ────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_tenant_lead
  ON tenant_appointments (tenant_id, client_phone)
  WHERE status = 'LEAD' AND client_phone IS NOT NULL;
