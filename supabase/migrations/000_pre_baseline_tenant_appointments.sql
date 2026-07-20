-- Pre-baseline: create tenant_appointments.
--
-- WHY THIS FILE EXISTS:
--   tenant_appointments has NO CREATE TABLE statement anywhere in the repo
--   migrations/ or seeds/ — it was originally created out-of-band (Supabase
--   Studio SQL) in the dev project. The CI workflow provisions a FRESH,
--   dedicated Supabase project, so the table would not exist and
--   20260718_tenant_appointments_lead_status.sql (ALTER TABLE ... ADD CONSTRAINT
--   tenant_appointments_status_check) would fail with "relation does not exist".
--
-- SCHEMA SOURCE OF TRUTH:
--   This DDL is a verbatim capture of the live dev database
--   (information_schema.columns + pg_constraint), NOT reconstructed from docs.
--   Live columns/constraints observed:
--     id            uuid      NOT NULL DEFAULT gen_random_uuid()
--     tenant_id     uuid      NULL     (FK -> tenants.id ON DELETE CASCADE)
--     start_time    timestamptz NOT NULL
--     end_time      timestamptz NOT NULL
--     client_name   text      NULL
--     client_phone  text      NULL
--     status        text      NULL     DEFAULT 'AVAILABLE'::text
--     created_at    timestamptz NULL   DEFAULT now()
--     PK tenant_appointments_pkey (id)
--     CHECK tenant_appointments_status_check
--       (status = ANY (ARRAY['AVAILABLE','RESERVED','CONFIRMED','LEAD']))
--     FK tenant_appointments_tenant_id_fkey (tenant_id -> tenants.id)
--
-- NOTE the live column nullability differs from older README prose:
--   status/tenant_id/client_name/client_phone/created_at are NULLABLE in the
--   real DB. Preserve that exactly — do not "tighten" to NOT NULL.

CREATE TABLE IF NOT EXISTS public.tenant_appointments (
  id           uuid        NOT NULL DEFAULT gen_random_uuid(),
  tenant_id    uuid        NULL,
  start_time   timestamptz NOT NULL,
  end_time     timestamptz NOT NULL,
  client_name  text        NULL,
  client_phone text        NULL,
  status       text        NULL DEFAULT 'AVAILABLE'::text,
  created_at   timestamptz NULL DEFAULT now(),
  CONSTRAINT tenant_appointments_pkey
    PRIMARY KEY (id),
  CONSTRAINT tenant_appointments_tenant_id_fkey
    FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE
);

-- The LEAD status value is added idempotently by
-- 20260718_tenant_appointments_lead_status.sql; we do NOT recreate the CHECK
-- here so the two migrations remain independent and re-runnable.
