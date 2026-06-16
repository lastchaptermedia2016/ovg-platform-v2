import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';

// Request validation schema — expanded to enforce the atomic consolidated payload.
// This contract mirrors the sync_tenant_config RPC parameter signature.
// branding_colors is a flat text string in the tenants table; the RPC extracts
// via p_branding->>'primaryColor'.
const UpdateConfigSchema = z.object({
  tenantId: z.string().uuid(),
  branding: z.object({
    primaryColor: z.string(),
    accentColor: z.string(),
    logoUrl: z.string(),
    widgetBodyOpacity: z.number().min(0).max(1),
    widgetBodyBackground: z.string(),
  }).optional(),
  features: z.object({
    aiInsightBadge: z.boolean().optional(),
    aiDesignMirror: z.boolean().optional(),
    customCss: z.boolean().optional(),
  }).optional(),
});

// ──────────────────────────────────────────────
// Double-lock ownership verification
// Validates that authenticated user owns/reseller for the tenant
// ──────────────────────────────────────────────
async function validateTenantOwnership(
  userId: string,
  tenantId: string,
): Promise<{ resellerId: string } | null> {
  const supabase = await createClient();

  // Resolve tenant to get its reseller_id
  const { data: tenant, error } = await supabase
    .from("tenants")
    .select("reseller_id")
    .eq("id", tenantId)
    .single();

  if (error || !tenant?.reseller_id) {
    return null;
  }

  // Verify user has access to this reseller via user_resellers junction
  const { data: userReseller } = await supabase
    .from("user_resellers")
    .select("reseller_id")
    .eq("user_id", userId)
    .eq("reseller_id", tenant.reseller_id)
    .maybeSingle();

  if (!userReseller) {
    return null;
  }

  return { resellerId: tenant.reseller_id };
}

// ──────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    // ── STEP 1: Session Validation ─────────────────
    const supabase = await createClient();
    const { data: { session }, error: authError } = await supabase.auth.getSession();

    if (authError || !session) {
      return NextResponse.json(
        { success: false, error: "Unauthorized access path" },
        { status: 401 }
      );
    }

    // ── STEP 2: Parse and validate request body ─────
    const body = await request.json();
    const validationResult = UpdateConfigSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid request parameters', details: validationResult.error.flatten() },
        { status: 400 }
      );
    }

    const { tenantId, branding, features } = validationResult.data;

    // ── STEP 3: Double-lock tenant ownership verification ──
    const ownership = await validateTenantOwnership(session.user.id, tenantId);

    if (!ownership) {
      return NextResponse.json(
        { success: false, error: "Forbidden - tenant access denied" },
        { status: 403 }
      );
    }

    // Transaction Logging
    console.log('=== ATOMIC UPDATE CONFIG REQUEST ===');
    console.log('tenantId:', tenantId);
    console.log('resellerId (validated):', ownership.resellerId);
    console.log('branding:', JSON.stringify(branding, null, 2));
    console.log('features:', JSON.stringify(features, null, 2));
    console.log('timestamp:', new Date().toISOString());

    // Initialize Supabase client (already have from session check)
    // Note: supabaseAdmin removed - using request-bound client only

    // ================================================================
    // ATOMIC COMMIT via sync_tenant_config RPC
    //
    // The RPC wraps both the branding_colors/custom_assets column updates
    // AND the widget_config->features merge inside a single PostgreSQL
    // transaction block. If either write fails, the entire transaction
    // rolls back instantly — no partial-save state.
    //
    // IMPORTANT: branding_colors is a FLAT TEXT STRING in the tenants
    // table (not JSONB). The RPC extracts via:
    //   p_branding->>'primaryColor' -> branding_colors
    //   p_branding->>'accentColor'  -> branding_colors
    //
    // widget_config is JSONB and receives both the 'branding' sub-tree
    // and the merged 'features' sub-tree.
    // ================================================================
    const { data, error: rpcError } = await supabase.rpc('sync_tenant_config', {
      p_tenant_id: tenantId,
      p_branding: branding ?? null,
      p_features: features ?? null,
    });

    if (rpcError) {
      console.error('=== RPC ERROR ===');
      console.error('Error object:', JSON.stringify(rpcError, null, 2));
      console.error('Error code:', rpcError.code);
      console.error('Error message:', rpcError.message);
      console.error('Error details:', rpcError.details);

      return NextResponse.json(
        {
          success: false,
          error: 'Database commit failed',
          code: rpcError.code,
          details: rpcError.message,
        },
        { status: 500 }
      );
    }

    // The RPC returns { success: boolean, widget_config: JSONB }
    const result = (data as unknown) as {
      success: boolean;
      widget_config?: Record<string, unknown>;
    };

    if (!result?.success) {
      console.error('=== RPC REPORTED FAILURE ===');
      console.error('RPC result:', JSON.stringify(result, null, 2));
      return NextResponse.json(
        { success: false, error: 'Atomic configuration sync failed' },
        { status: 500 }
      );
    }

    console.log('=== ATOMIC UPDATE SUCCESS ===');
    console.log('widget_config:', JSON.stringify(result.widget_config, null, 2));

    return NextResponse.json({
      success: true,
      widget_config: result.widget_config ?? null,
      appliedAt: new Date().toISOString(),
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('=== UNEXPECTED ERROR ===');
    console.error('Error:', error);
    console.error('Error message:', errorMessage);
    if (error instanceof Error) console.error('Error stack:', error.stack);
    return NextResponse.json(
      { success: false, error: 'Internal server error', details: errorMessage },
      { status: 500 }
    );
  }
}

// Handle unsupported methods
export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405 }
  );
}

export async function PUT() {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405 }
  );
}

export async function DELETE() {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405 }
  );
}