import { supabaseAdmin } from '@/lib/supabase/admin';

/**
 * Anonymous rate limiting for public, unauthenticated widget endpoints.
 *
 * Shared Supabase-backed counter (see migration 20260718_anon_rate_limit.sql).
 * NOT an in-process Map: the widget embed runs on arbitrary third-party domains
 * with no session, and the app may be deployed serverless (per-request processes
 * with no shared memory), where an in-process limiter would be silently broken.
 *
 * DUAL-KEY THREAT MODEL — both checks run on every anon request:
 *   1. composite  `t:<tenantId>|ip:<ip>`  -> single-IP burst cap (low)
 *   2. tenant     `t:<tenantId>`           -> global tenant volume cap (higher, no IP)
 * Key #2 catches a botnet ROTATING source IPs: each rotated IP gets a fresh
 * composite bucket that never trips, so only the tenant key detects the
 * collective volume crossing the tenant ceiling. A request is blocked if EITHER
 * key is exceeded.
 *
 * IMPORTANT — CORS is NOT a security boundary here. This route returns
 * `Access-Control-Allow-Origin: '*'` because the product must work on arbitrary
 * client domains; a tenantId is already public by design. Therefore ANYONE with
 * a tenantId can call this endpoint from anywhere. Rate limiting (this module)
 * is the actual abuse boundary, not CORS. This is a deliberate, documented
 * tradeoff — not an assumed-safe default.
 *
 * FAIL-OPEN: a DB error is treated as "not limited" so an infra blip never locks
 * out legitimate visitors.
 */

export const RATE_LIMIT_MAX_PER_IP = 15;
export const RATE_LIMIT_MAX_PER_TENANT = 200;
export const RATE_LIMIT_WINDOW_SECONDS = 60;

export interface RateLimitResult {
  limited: boolean;
  reason?: 'per_ip' | 'per_tenant';
  hits?: number;
}

async function checkKey(key: string, max: number): Promise<{ exceeded: boolean; hits: number }> {
  const { data, error } = await supabaseAdmin.rpc('check_rate_limit', {
    p_key: key,
    p_max: max,
    p_window_seconds: RATE_LIMIT_WINDOW_SECONDS,
  });
  if (error) return { exceeded: false, hits: 0 }; // fail open
  const row = (data as { exceeded: boolean; hits: number }[] | null)?.[0];
  return { exceeded: row?.exceeded ?? false, hits: row?.hits ?? 0 };
}

/**
 * Returns whether the anon request should be blocked. Checks the composite
 * (per-IP) key first, then the global tenant key. Either exceeding => blocked.
 */
export async function isAnonRateLimited(tenantId: string, ip: string): Promise<RateLimitResult> {
  const composite = await checkKey(`t:${tenantId}|ip:${ip}`, RATE_LIMIT_MAX_PER_IP);
  if (composite.exceeded) {
    return { limited: true, reason: 'per_ip', hits: composite.hits };
  }
  const tenant = await checkKey(`t:${tenantId}`, RATE_LIMIT_MAX_PER_TENANT);
  if (tenant.exceeded) {
    return { limited: true, reason: 'per_tenant', hits: tenant.hits };
  }
  return { limited: false };
}
