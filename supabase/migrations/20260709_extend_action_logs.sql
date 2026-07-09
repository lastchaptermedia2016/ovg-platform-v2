-- Extend action_logs to support live performance telemetry.
-- Existing inserts omit these columns; keep them nullable on add, then
-- backfill a default so historical rows are queryable without errors.

ALTER TABLE action_logs
  ADD COLUMN success BOOLEAN,
  ADD COLUMN duration_ms NUMERIC(10, 2);

-- Backfill historical rows so aggregates (success rate, avg latency) are valid.
UPDATE action_logs SET success = TRUE WHERE success IS NULL;
UPDATE action_logs SET duration_ms = 0 WHERE duration_ms IS NULL;

-- Apply defaults to guarantee new rows are populated even before the
-- orchestration patch lands. Columns remain nullable to avoid breaking
-- any in-flight inserts that do not yet supply them.
ALTER TABLE action_logs
  ALTER COLUMN success SET DEFAULT TRUE,
  ALTER COLUMN duration_ms SET DEFAULT 0;

COMMENT ON COLUMN action_logs.success IS 'Whether the dispatched action completed without throwing';
COMMENT ON COLUMN action_logs.duration_ms IS 'Wall-clock execution time of the action in milliseconds';

-- RLS: allow authenticated users to read action logs for tenants they own/manage.
-- (Migration 015 only defined an INSERT policy; without this, the client
-- dashboard query is denied by RLS and telemetry can never render.)
CREATE POLICY "Users can read action logs for their tenants" ON action_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_resellers ur
      INNER JOIN tenants t ON ur.reseller_id = t.reseller_id
      WHERE ur.user_id = auth.uid()
        AND t.id = action_logs.tenant_id
    )
  );
