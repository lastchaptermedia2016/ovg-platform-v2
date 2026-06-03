/**
 * @deprecated Migrate to `@/lib/db/resolve-reseller` which provides the same
 * `resolveResellerId` export plus `resolveResellerFull` for full-row lookups
 * and `ResolvedReseller` for strict typing.
 *
 * The new resolver uses a UUID-aware branching strategy (single-pass in the
 * common case) instead of the sequential slug→tenant_id fallback pattern.
 *
 * Import replacement:
 *   import { resolveResellerId } from '@/lib/db/resolve-reseller';
 *
 * Full resolution:
 *   import { resolveResellerFull } from '@/lib/db/resolve-reseller';
 *   const { data, error } = await resolveResellerFull(db, identifier);
 */
export { resolveResellerId } from '@/lib/db/resolve-reseller';