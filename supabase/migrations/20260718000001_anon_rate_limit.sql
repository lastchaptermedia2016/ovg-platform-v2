-- Anonymous rate limiter for public, unauthenticated widget endpoints.
--
-- WHY SUPABASE-BACKED (not in-process):
--   The anon chat endpoint is called from arbitrary third-party embed domains
--   with no session. The app may run serverless (per-request processes with no
--   shared memory) or as a persistent Node server. An in-process token bucket
--   (per-instance Map) is silently broken under serverless because each
--   invocation has independent memory. A Supabase-backed counter is shared
--   across ALL instances, so the limit actually holds regardless of deployment.
--
-- DUAL-KEY THREAT MODEL:
--   Two independent counters run on every anon request:
--     1. composite key  t:<tenantId>|ip:<ip>   -> caps a single IP hammering one tenant
--     2. tenant key     t:<tenantId>            -> caps GLOBAL tenant volume (no IP)
--   Key #2 is required to stop a botnet that rotates source IPs: each rotated IP
--   gets a fresh composite bucket (low count, never trips), so only the tenant
--   key can detect that the collective volume crossed the tenant ceiling.
--   A request is blocked if EITHER key is exceeded.
--
-- FAIL-OPEN: the route treats a DB error as "not limited" so an infra blip never
--   locks out legitimate visitors. Abuse resistance is best-effort, not a hard
--   guarantee — pair with the tenant's own abuse monitoring.
--
-- SECURITY DEFINER + search_path pin so the anon role can execute without being
--   granted direct table access. Only this function touches rate_limits.

CREATE TABLE IF NOT EXISTS rate_limits (
  key           TEXT PRIMARY KEY,
  hits          INT  NOT NULL DEFAULT 0,
  window_start  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Fixed-window counter: atomic upsert, reset when the window has elapsed.
CREATE OR REPLACE FUNCTION check_rate_limit(
  p_key TEXT,
  p_max INT,
  p_window_seconds INT
)
RETURNS TABLE ( exceeded BOOLEAN, hits INT )
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now      TIMESTAMPTZ := now();
  v_row      rate_limits%ROWTYPE;
  v_exceeded BOOLEAN;
BEGIN
  -- Lock the row for update so concurrent increments are serialized.
  SELECT * INTO v_row
  FROM rate_limits
  WHERE key = p_key
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO rate_limits (key, hits, window_start)
    VALUES (p_key, 1, v_now);
    RETURN QUERY SELECT FALSE, 1;
    RETURN;
  END IF;

  -- Window expired -> reset the counter for a fresh window.
  IF v_row.window_start <= v_now - (p_window_seconds || ' seconds')::INTERVAL THEN
    UPDATE rate_limits
    SET hits = 1, window_start = v_now
    WHERE key = p_key;
    RETURN QUERY SELECT FALSE, 1;
    RETURN;
  END IF;

  -- Within window -> increment and report.
  UPDATE rate_limits
  SET hits = rate_limits.hits + 1
  WHERE key = p_key
  RETURNING rate_limits.hits INTO v_row.hits;

  v_exceeded := v_row.hits > p_max;
  RETURN QUERY SELECT v_exceeded, v_row.hits;
END;
$$;

GRANT EXECUTE ON FUNCTION check_rate_limit(TEXT, INT, INT) TO anon, authenticated;

COMMENT ON FUNCTION check_rate_limit IS
  'Fixed-window rate counter for anonymous endpoints. Composite (tenant+ip) and tenant-only keys run in tandem to stop both single-IP bursts and IP-rotating botnets.';
