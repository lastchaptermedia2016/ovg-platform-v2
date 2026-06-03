import type { PostgrestError } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { isValidUUID } from '@/lib/utils/uuid';

// ─── Types ───────────────────────────────────────────────────────────────────

/** Client type that all Supabase clients converge to after awaiting */
type SupabaseDb = Awaited<ReturnType<typeof createClient>> | typeof supabaseAdmin;

/**
 * Full reseller row shape returned by the resolver.
 *
 * Encapsulated here so route handlers never need to interpret raw
 * database rows for identity purposes.
 *
 * NOTE: `version_stamp` is intentionally absent from the selected columns
 * because the underlying `resellers` table does not have that column.
 * It was an aspirational schema field that was never migrated into the DB.
 * Routes that expect a version number fall back to a safe default (e.g. `?? 1`).
 */
export interface ResolvedReseller {
  id: string;
  slug: string;
  tenant_id: string;
  name: string;
  branding: Record<string, unknown> | null;
  /** @deprecated This field is NOT selected from the database (column does not exist).
   *  It remains on the type for backward compatibility with code that destructures
   *  a ResolvedReseller and expects `version_stamp` to compile. Use `?? 1` as a
   *  default when reading this value at runtime — it will always be `undefined`. */
  version_stamp?: never;
}

/**
 * Result wrapper returned by `resolveResellerFull`.
 *
 * - `data`: The resolved reseller row, or `null` when not found.
 * - `error`: A PostgrestError or generic Error when the query itself
 *   fails, or `null` when the query succeeded (even if empty).
 */
export interface ResolveResult {
  data: ResolvedReseller | null;
  error: PostgrestError | Error | null;
}

// ─── Constants ───────────────────────────────────────────────────────────────

/**
 * Columns selected on every resolution query.
 *
 * CRITICAL: Do NOT add columns that don't exist in the database.
 * `version_stamp` was previously listed here, causing a `42703` error
 * on every query. If you need a new column, add it to the `resellers`
 * table via a Supabase migration first, then update this constant.
 */
const RESOLVER_COLUMNS = 'id, slug, tenant_id, name, branding' as const;

// ─── Core Resolver ───────────────────────────────────────────────────────────

/**
 * Resolve a reseller record from an identifier that may be a UUID (id or
 * tenant_id) or a human-readable slug.
 *
 * **Single-pass branching** (one DB query in the common case):
 *
 * ```
 * identifier
 *   ├─ isValidUUID(identifier)?
 *   │    ├─ true  → .eq('id', identifier)          ← PK lookup
 *   │    │     └─ hit? → done
 *   │    │     └─ miss? → .eq('tenant_id', value)  ← fallback for UUID
 *   │    │           └─ hit/miss → done
 *   │    └─ false → .eq('slug', identifier)        ← slug lookup
 *   │          └─ hit/miss → done
 * ```
 *
 * This replaces the previous sequential "slug → tenant_id" pattern that
 * always made two queries and could not handle raw UUID PKs.
 *
 * @param db        - Any Supabase client (authenticated, browser, or admin).
 * @param identifier - The value to resolve (slug string or UUID).
 * @returns A `ResolveResult` with the full row or null.
 *
 * @example
 *   const { data, error } = await resolveResellerFull(supabase, 'lastchaptermedia2016');
 *   const { data } = await resolveResellerFull(supabaseAdmin, '284931b2-...');
 */
export async function resolveResellerFull(
  db: SupabaseDb,
  identifier: string,
): Promise<ResolveResult> {
  try {
    // ── Guard: reject empty and Next.js hydration artifacts early ─────
    const trimmed = identifier.trim();
    if (!trimmed || trimmed.includes('[') || trimmed.includes('object')) {
      return { data: null, error: null };
    }

    // ── Branch: UUID → id (PK) lookup with tenant_id fallback ─────────
    if (isValidUUID(trimmed)) {
      // Primary: match by PK
      const { data: idResult, error: idError } = await db
        .from('resellers')
        .select(RESOLVER_COLUMNS)
        .eq('id', trimmed)
        .maybeSingle();

      if (idResult) {
        return { data: idResult as ResolvedReseller, error: null };
      }

      // Fallback: the UUID might be a tenant_id rather than the PK
      const { data: tenantResult, error: tenantError } = await db
        .from('resellers')
        .select(RESOLVER_COLUMNS)
        .eq('tenant_id', trimmed)
        .maybeSingle();

      if (tenantResult) {
        return { data: tenantResult as ResolvedReseller, error: null };
      }

      // Neither matched — return the more meaningful of the two errors
      const finalError = idError || tenantError;
      if (finalError) {
        console.error('[resolveReseller] UUID query error:', {
          message: finalError.message,
          details: (finalError as PostgrestError).details,
          hint: (finalError as PostgrestError).hint,
          code: (finalError as PostgrestError).code,
        });
      }
      return { data: null, error: finalError };
    }

    // ── Non-UUID → slug lookup ──────────────────────────────────────────
    const { data: slugResult, error: slugError } = await db
      .from('resellers')
      .select(RESOLVER_COLUMNS)
      .eq('slug', trimmed)
      .maybeSingle();

    if (slugResult) {
      return { data: slugResult as ResolvedReseller, error: null };
    }

    if (slugError) {
      console.error('[resolveReseller] Slug query error:', {
        message: slugError.message,
        details: slugError.details,
        hint: slugError.hint,
        code: slugError.code,
      });
    }
    return { data: null, error: slugError };

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[resolveReseller] Unexpected exception:', msg);
    return {
      data: null,
      error: err instanceof Error ? err : new Error(msg),
    };
  }
}

// ─── Convenience: ID-only Resolver ───────────────────────────────────────────

/**
 * Resolve a reseller's primary key (id) from a slug, UUID PK, or tenant_id.
 *
 * A thin wrapper around `resolveResellerFull` that extracts only the UUID PK.
 * Useful when the caller only needs the `id` for foreign-key filtering.
 *
 * @param db          - Any Supabase client.
 * @param identifier  - The value to resolve (slug or UUID).
 * @returns The resolved `resellers.id`, or `null` if not found.
 *
 * @example
 *   const resellerId = await resolveResellerId(supabase, 'lastchaptermedia2016');
 *   if (!resellerId) return NextResponse.json({ error: 'Not found' }, { status: 404 });
 */
export async function resolveResellerId(
  db: SupabaseDb,
  identifier: string,
): Promise<string | null> {
  const { data } = await resolveResellerFull(db, identifier);
  return data?.id ?? null;
}