-- =============================================================================
-- Visitor Memory Retention Cleanup
-- =============================================================================
-- Auto-expires visitor_memories rows where last_seen_at is older than 12 months.
--
-- INVOCATION:
--   This function is intended to be called periodically (e.g., daily via
--   pg_cron, or opportunistically from the process-command route). It is
--   lightweight and safe to run concurrently with normal traffic.
--
-- RETENTION WINDOW:
--   12 months (365 days). Override by changing p_retention_days if a tenant
--   configurable window is added later.
-- =============================================================================

CREATE OR REPLACE FUNCTION cleanup_expired_visitor_memories(
  p_retention_days INT DEFAULT 365
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cutoff TIMESTAMPTZ := timezone('utc'::text, now()) - (p_retention_days || ' days')::INTERVAL;
  v_deleted INT;
BEGIN
  DELETE FROM visitor_memories
  WHERE last_seen_at < v_cutoff;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

COMMENT ON FUNCTION cleanup_expired_visitor_memories IS 'Deletes visitor_memories rows inactive longer than the retention window. Returns count of rows deleted.';
