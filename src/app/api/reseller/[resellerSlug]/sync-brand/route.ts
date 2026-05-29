import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { z } from 'zod';

// ================================================================
// SCHEMA: Zod validation for the branding commit payload
// Standardizes on tenantId (not clientId) across the entire pipeline.
// ================================================================
const SyncBrandSchema = z.object({
  tenantId: z.string().uuid({
    message: 'tenantId must be a valid UUID',
  }),
  brandingBag: z.object({
    primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, {
      message: 'primaryColor must be a valid hex color (e.g., #0097b2)',
    }),
    accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, {
      message: 'accentColor must be a valid hex color (e.g., #D4AF37)',
    }),
    logoUrl: z.string().url().nullable(),
    favicon: z.string().url().nullable().optional(),
    metaTitle: z.string().max(120).nullable().optional(),
    metaDescription: z.string().max(320).nullable().optional(),
    websiteUrl: z
      .string()
      .url()
      .nullable()
      .optional()
      .transform((val) => val ?? null),
    typography: z
      .object({
        headingFont: z.string(),
        bodyFont: z.string(),
      })
      .optional(),
    borderRadius: z.number().min(0).max(24).optional(),
    mode: z.enum(['light', 'dark']).optional(),
  }),
  expectedVersion: z.number().int().positive({
    message: 'expectedVersion must be a positive integer',
  }),
});

/**
 * POST /api/reseller/[resellerSlug]/sync-brand
 *
 * Atomically commits branding changes with optimistic concurrency control.
 *
 * Security contract:
 *   1. The resellerSlug from the URL path identifies which reseller to update.
 *   2. The tenantId in the body is validated as a UUID and verified against the
 *      reseller's ownership via the user_resellers junction table.
 *   3. websiteUrl is read from / written to branding_bag->>'websiteUrl' (JSONB path).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ resellerSlug: string }> }
) {
  try {
    const { resellerSlug } = await params;

    // ================================================================
    // SECURITY LAYER 1: Authenticate the user
    // ================================================================
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ================================================================
    // SECURITY LAYER 2: Authorize — verify this user owns the reseller
    // ================================================================
    // STEP 2a — Resolve identifier (slug OR tenant_id) to the internal primary key.
    // Sequential resolution avoids PostgREST .or() edge cases and works regardless
    // of which column (or both) exist in the current schema.
    //
    // 🔒 SECURITY CONTRACT:
    // The resolved reseller.id is immediately locked to the authenticated user
    // via the user_resellers check in STEP 2b below. The service role is NEVER
    // used to fetch user-scoped data.
    let resolvedReseller: { id: string; tenant_id: string } | null = null;

    // 1a — Try slug lookup with user session
    const { data: sessionSlugResult } = await supabase
      .from('resellers')
      .select('id, tenant_id')
      .eq('slug', resellerSlug)
      .maybeSingle();

    if (sessionSlugResult) {
      resolvedReseller = sessionSlugResult;
    } else {
      // 1b — Fallback to tenant_id lookup with user session
      const { data: sessionTenantResult } = await supabase
        .from('resellers')
        .select('id, tenant_id')
        .eq('tenant_id', resellerSlug)
        .maybeSingle();

      if (sessionTenantResult) {
        resolvedReseller = sessionTenantResult;
      }
    }

    if (!resolvedReseller) {
      // 2a — Try slug lookup with service role (RLS fallback)
      console.log(
        '[sync-brand] User-session resolve failed, trying service-role fallback'
      );
      const { data: adminSlugResult } = await supabaseAdmin
        .from('resellers')
        .select('id, tenant_id')
        .eq('slug', resellerSlug)
        .maybeSingle();

      if (adminSlugResult) {
        resolvedReseller = adminSlugResult;
      } else {
        // 2b — Fallback to tenant_id lookup with service role
        const { data: adminTenantResult } = await supabaseAdmin
          .from('resellers')
          .select('id, tenant_id')
          .eq('tenant_id', resellerSlug)
          .maybeSingle();

        resolvedReseller = adminTenantResult;
      }
    }

    if (!resolvedReseller) {
      console.error('[sync-brand] Reseller not found for identifier:', resellerSlug);
      return NextResponse.json(
        { error: 'Reseller not found' },
        { status: 404 }
      );
    }

    const reseller = resolvedReseller;

    // STEP 2b — Authoritative check: verify the user is linked to the resolved internal ID
    let authorized = false;

    const { data: userLink } = await supabase
      .from('user_resellers')
      .select('reseller_id, role')
      .eq('user_id', user.id)
      .eq('reseller_id', reseller.id)
      .maybeSingle();

    if (userLink) {
      authorized = true;
    } else {
      // Fallback: service-role can read all junction rows
      const { data: adminLink } = await supabaseAdmin
        .from('user_resellers')
        .select('reseller_id, role')
        .eq('user_id', user.id)
        .eq('reseller_id', reseller.id)
        .maybeSingle();

      authorized = !!adminLink;
    }

    if (!authorized) {
      console.error('[sync-brand] Authorization failed:', {
        userId: user.id,
        resellerId: reseller.id,
      });
      return NextResponse.json(
        { error: 'Forbidden: You do not have access to this reseller' },
        { status: 403 }
      );
    }

    // ================================================================
    // VALIDATION LAYER: Parse and sanitize the branding payload
    // tenantId comes from the validated Zod schema, not raw body — prevents spoofing.
    // Descriptive error logging includes the offending field path for quick debugging.
    // ================================================================
    const body = await request.json();
    const parsed = SyncBrandSchema.safeParse(body);
    if (!parsed.success) {
      // Log each Zod issue with path for rapid debugging
      for (const issue of parsed.error.issues) {
        console.error(
          `[sync-brand] Zod validation error at path "${issue.path.join('.')}": ${issue.message}`,
        );
      }
      return NextResponse.json(
        {
          error: 'Invalid branding payload',
          details: parsed.error.flatten(),
        },
        { status: 400 }
      );
    }

    const { tenantId, brandingBag, expectedVersion } = parsed.data;

    // CONSISTENCY CHECK: Ensure the body tenantId matches the resolved database record
    if (tenantId !== reseller.tenant_id) {
      console.error(
        `[sync-brand] Tenant mismatch: Payload ID "${tenantId}" !== DB Resolved ID "${reseller.tenant_id}"`,
      );
      return NextResponse.json(
        { error: 'Payload Tenant ID does not match the resolved reseller' },
        { status: 400 }
      );
    }

    // ================================================================
    // FETCH existing branding to preserve websiteUrl if not in payload
    // Column renamed from branding_bag to branding to match DB schema.
    // ================================================================
    const { data: existingReseller, error: fetchError } = await supabase
      .from('resellers')
      .select('branding, version_stamp')
      .eq('id', reseller.id)
      .single();

    if (fetchError || !existingReseller) {
      console.error('[sync-brand] Error fetching reseller:', fetchError);
      return NextResponse.json(
        { error: 'Reseller not found' },
        { status: 404 }
      );
    }

    // Preserve existing websiteUrl from JSONB if the payload doesn't include it
    const existingWebsiteUrl =
      (existingReseller.branding as Record<string, unknown> | null)
        ?.websiteUrl ?? null;

    const finalBrandingBag = {
      ...brandingBag,
      websiteUrl: brandingBag.websiteUrl ?? existingWebsiteUrl,
    };

    // ================================================================
    // COMMIT LAYER: Atomic RPC with optimistic concurrency control
    // ================================================================
    const { data: rpcResult, error: rpcError } = await supabase.rpc(
      'sync_reseller_branding',
      {
        p_tenant_id: reseller.tenant_id, // Use verified UUID for RPC
        p_branding_bag: finalBrandingBag,
        p_expected_version: expectedVersion,
      },
    );

    if (rpcError) {
      console.error('[sync-brand] RPC error:', rpcError);
      return NextResponse.json(
        { error: 'Database commit failed', details: rpcError },
        { status: 500 }
      );
    }

    // The RPC returns TABLE(success BOOLEAN, new_version INTEGER, conflict_diff JSONB)
    const result = (rpcResult as unknown as Array<{
      success: boolean;
      new_version: number;
      conflict_diff: Record<string, unknown> | null;
    }>)?.[0];

    if (!result) {
      return NextResponse.json(
        { error: 'Unexpected empty response from database' },
        { status: 500 }
      );
    }

    if (!result.success) {
      // Conflict detected — return 409 with details
      return NextResponse.json(
        {
          error: 'Branding conflict detected',
          conflict: result.conflict_diff,
          currentVersion: result.new_version,
        },
        { status: 409 }
      );
    }

    // ================================================================
    // SUCCESS: Log and respond
    // ================================================================
    console.log(
      `[sync-brand] Reseller "${resellerSlug}" branding committed v${expectedVersion} → v${result.new_version} by user ${user.id}`,
    );

    return NextResponse.json({
      success: true,
      version: result.new_version,
      appliedAt: new Date().toISOString(),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[sync-brand] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: msg },
      { status: 500 }
    );
  }
}