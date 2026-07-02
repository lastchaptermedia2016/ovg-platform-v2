import type { PostgrestError } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Result wrapper returned by `resolveClientSlug`.
 *
 * - `data`: The resolved slug string, or `null` when not found.
 * - `error`: A PostgrestError or generic Error when the query itself
 *   fails, or `null` when the query succeeded (even if empty).
 */
export interface ResolveClientSlugResult {
  data: string | null;
  error: PostgrestError | Error | null;
}

// ─── Core Resolver ───────────────────────────────────────────────────────────

/**
 * Resolve a tenant slug from the tenant UUID (the authenticated user's `id`).
 *
 * **Direct tenants-table lookup**:
 *
 * ```
 * tenantId
 *   └─ .from('tenants').select('slug').eq('id', tenantId)
 * ```
 *
 * This is the permanent source of truth for the /client portal.
 * No resellers-table fallback is performed.
 *
 * @param tenantId - The authenticated user's UUID (matches `tenants.id`).
 * @returns A `ResolveClientSlugResult` with the slug or null.
 *
 * @example
 *   const supabase = createClient();
 *   const { data } = await resolveClientSlug(supabase, '8e7c90fb-...');
 */
export async function resolveClientSlug(
  tenantId: string,
): Promise<ResolveClientSlugResult> {
  const trimmed = tenantId.trim();

  if (!trimmed) {
    return { data: null, error: new Error('Empty tenantId passed to resolveClientSlug') };
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from('tenants')
    .select('slug')
    .eq('id', trimmed)
    .maybeSingle();

  if (error) {
    console.error('[resolveClientSlug] Query error:', {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });
    return { data: null, error };
  }

  return { data: (data?.slug as string | null) ?? null, error: null };
}
