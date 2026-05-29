import { NextRequest, NextResponse } from 'next/server';
import type { PostgrestError } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { BrandingFetchResponse, BrandingBag } from '@/types';

/**
 * ---------------------------------------------------------------------------
 * Database client type — createClient() returns a Promise, so we unwrap it
 * for the helper function signatures.
 * ---------------------------------------------------------------------------
 */
export type SupabaseDb = Awaited<ReturnType<typeof createClient>> | typeof supabaseAdmin;

/**
 * ---------------------------------------------------------------------------
 * Resolved Reseller shape returned by both resolveReseller implementations.
 * ---------------------------------------------------------------------------
 */
export interface ResolvedReseller {
  id: string;
  tenant_id: string;
  name: string;
  branding: BrandingBag | null;
  version_stamp: number | null;
}

// ===================================================================
// TWO-STEP RESOLUTION
// ===================================================================

/**
 * STEP 1 — Resolve a reseller record by slug OR tenant_id.
 *
 * Sequential resolution: try slug first, then fall back to tenant_id.
 * This avoids PostgREST .or() edge cases and works regardless of which
 * column (or both) exist in the current schema.
 */
export async function resolveReseller(
  db: SupabaseDb,
  identifier: string,
): Promise<{ data: ResolvedReseller | null; error: PostgrestError | Error | null }> {
  try {
    // 1 — Try slug lookup
    const { data: slugResult, error: slugError } = await db
      .from('resellers')
      .select('id, tenant_id, name, branding, version_stamp')
      .eq('slug', identifier)
      .maybeSingle();

    if (slugResult) {
      return { data: slugResult as ResolvedReseller, error: null };
    }

    // 2 — Fallback to tenant_id lookup
    const { data: tenantResult, error: tenantError } = await db
      .from('resellers')
      .select('id, tenant_id, name, branding, version_stamp')
      .eq('tenant_id', identifier)
      .maybeSingle();

    if (tenantResult) {
      return { data: tenantResult as ResolvedReseller, error: null };
    }

    // 3 — Neither matched; return the last error (if any) for diagnostics
    const finalError = slugError || tenantError;
    if (finalError) {
      console.error('[branding GET] resolveReseller query error:', {
        message: finalError.message,
        details: finalError.details,
        hint: finalError.hint,
        code: finalError.code,
      });
    }
    return { data: null, error: finalError };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[branding GET] resolveReseller unexpected exception:', msg);
    return { data: null, error: err instanceof Error ? err : new Error(msg) };
  }
}

/**
 * STEP 2 — Authorize that the authenticated user has access to the
 * resolved reseller by checking the user_resellers junction table
 * against the reseller's primary key (id).
 */
export async function authorizeResellerAccess(
  db: SupabaseDb,
  userId: string,
  resellerId: string,
): Promise<{ authorized: boolean; error: PostgrestError | Error | null }> {
  try {
    const { data, error } = await db
      .from('user_resellers')
      .select('reseller_id, role')
      .eq('user_id', userId)
      .eq('reseller_id', resellerId)
      .maybeSingle();

    if (error) {
      console.error('[branding GET] authorizeResellerAccess query error:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
      });
      return { authorized: false, error };
    }

    return { authorized: data !== null, error: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[branding GET] authorizeResellerAccess unexpected exception:', msg);
    return { authorized: false, error: err instanceof Error ? err : new Error(msg) };
  }
}

// ===================================================================
// HELPERS
// ===================================================================

/**
 * Given a row from the resellers table, build a BrandingBag with
 * safe defaults for any missing values.
 */
export function buildBrandingBag(row: ResolvedReseller): BrandingBag {
  return {
    primaryColor: row.branding?.primaryColor ?? '#0097b2',
    accentColor: row.branding?.accentColor ?? '#D4AF37',
    logoUrl: row.branding?.logoUrl ?? null,
    favicon: row.branding?.favicon ?? null,
    metaTitle: row.branding?.metaTitle ?? null,
    metaDescription: row.branding?.metaDescription ?? null,
    typography: row.branding?.typography ?? {
      headingFont: 'Inter',
      bodyFont: 'Inter',
    },
    borderRadius: row.branding?.borderRadius ?? 8,
    mode: row.branding?.mode ?? 'light',
  };
}

// ===================================================================
// ROUTE HANDLER
// ===================================================================

/**
 * GET /api/reseller/[resellerSlug]/branding
 *
 * Two-step resolution:
 *   1.  Resolve the reseller record by tenant_id OR slug.
 *   2.  Authorize the user via user_resellers using the resolved PK.
 *
 * Multi-tenant isolation is enforced at the application layer:
 *   - The user can only see branding for a reseller they are linked to
 *     via the user_resellers junction table.
 *   - If the user-session (authenticated) query fails, we fall back to
 *     the service-role client while preserving the same auth logic.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ resellerSlug: string }> },
) {
  try {
    const { resellerSlug } = await params;

    // -----------------------------------------------------------------
    // Guard: reject empty/debug artifacts early
    // -----------------------------------------------------------------
    if (!resellerSlug || resellerSlug === 'undefined') {
      console.error('[branding GET] Invalid reseller slug:', resellerSlug);
      return NextResponse.json(
        { error: 'Invalid reseller identifier' },
        { status: 400 },
      );
    }

    // -----------------------------------------------------------------
    // Authenticate
    // -----------------------------------------------------------------
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      console.error('[branding GET] Authentication failed:', authError?.message);
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // -----------------------------------------------------------------
    // STEP 1 — Resolve the reseller record
    // -----------------------------------------------------------------
    let resolved = await resolveReseller(supabase, resellerSlug);

    // If user-session query failed with a real error (not just "not found"),
    // try the service-role client as a fallback.
    if (!resolved.data && resolved.error) {
      console.log(
        '[branding GET] User-session resolve failed, trying service-role fallback',
      );
      resolved = await resolveReseller(supabaseAdmin, resellerSlug);
    }

    if (!resolved.data) {
      // Neither query found the reseller → 404
      console.error(
        '[branding GET] Reseller not found for identifier:',
        resellerSlug,
      );
      return NextResponse.json(
        { error: 'Reseller not found' },
        { status: 404 },
      );
    }

    const reseller = resolved.data;

    // -----------------------------------------------------------------
    // STEP 2 — Authorize via user_resellers using the resolved PK
    // -----------------------------------------------------------------
    let auth = await authorizeResellerAccess(supabase, user.id, reseller.id);

    /**
     * FALLBACK LOGIC:
     * If the user-session query failed to verify access (likely due to RLS 
     * restrictiveness on junction table lookups), we fall back to the 
     * service-role client. 
     * 
     * Note: We still pass user.id to ensure the admin client is only 
     * verifying a legitimate existing association for THIS specific user.
     */
    if (!auth.authorized && auth.error) {
      console.log(
        '[branding GET] User-session authorization failed, trying service-role fallback',
      );
      auth = await authorizeResellerAccess(
        supabaseAdmin,
        user.id,
        reseller.id,
      );
    }

    if (!auth.authorized) {
      console.error(
        '[branding GET] Access denied: user',
        user.id,
        'not linked to reseller',
        reseller.id,
      );
      return NextResponse.json(
        { error: 'Forbidden: You do not have access to this reseller' },
        { status: 403 },
      );
    }

    // -----------------------------------------------------------------
    // Build response
    // -----------------------------------------------------------------
    const brandingBag = buildBrandingBag(reseller);

    const response: BrandingFetchResponse = {
      name: reseller.name,
      tenant_id: reseller.tenant_id,
      brandingBag,
      version: reseller.version_stamp ?? 1,
    };

    return NextResponse.json(response);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[branding GET] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: msg },
      { status: 500 },
    );
  }
}