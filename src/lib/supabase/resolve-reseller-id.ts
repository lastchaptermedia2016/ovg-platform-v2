import { createClient as createServerClient } from '@/lib/supabase/server';
import { createBrowserClient } from '@/lib/supabase';
import { supabaseAdmin } from '@/lib/supabase/admin';

type SupabaseClient = Awaited<ReturnType<typeof createServerClient>> | ReturnType<typeof createBrowserClient> | typeof supabaseAdmin;

/**
 * Resolve a reseller's primary key (id) from a slug or tenant_id string.
 *
 * Sequential resolution — matches the pattern in layout.tsx and
 * branding/route.ts. First tries `slug`, falls back to `tenant_id`.
 *
 * @param db - Any Supabase client (server, browser, or admin)
 * @param identifier - The resellerSlug from the route param
 * @returns The resolved reseller.id, or null if not found
 */
export async function resolveResellerId(
  db: SupabaseClient,
  identifier: string,
): Promise<string | null> {
  if (!identifier) return null;

  // 1 — Try slug lookup
  const { data: slugResult } = await db
    .from('resellers')
    .select('id')
    .eq('slug', identifier)
    .maybeSingle();

  if (slugResult?.id) return slugResult.id;

  // 2 — Fallback to tenant_id lookup
  const { data: tenantResult } = await db
    .from('resellers')
    .select('id')
    .eq('tenant_id', identifier)
    .maybeSingle();

  return tenantResult?.id ?? null;
}