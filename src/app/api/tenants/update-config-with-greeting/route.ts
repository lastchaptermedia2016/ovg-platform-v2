import { NextRequest, NextResponse } from 'next/server';
import { createAuthClient, getAuthenticatedUser, unauthorizedResponse, validateTenantOwnership } from '@/lib/auth/server';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

// Production Excellence: Zod schema for request validation
const UpdateConfigSchema = z.object({
  tenantId: z.string().uuid(),
  configPatch: z.record(z.unknown()),
  aiSettings: z.record(z.unknown()).optional(),
});

// ──────────────────────────────────────────────
// POST — Update tenant config with optional greeting
// ──────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    // ── STEP 1: Authenticate user ───────────────────
    const { userId, error: authError } = await getAuthenticatedUser();
    if (authError || !userId) return unauthorizedResponse();

    // ── STEP 2: Parse and validate request body ─────
    const body = await request.json();
    const supabase = await createAuthClient();

    const validationResult = UpdateConfigSchema.safeParse(body);
    if (!validationResult.success) {
      console.error('[UpdateConfig] Validation error:', validationResult.error.flatten());
      return NextResponse.json({ 
        error: 'Invalid request body', 
        details: validationResult.error.flatten() 
      }, { status: 400 });
    }

    const { tenantId, configPatch, aiSettings } = validationResult.data;

    // ── STEP 3: Double-lock tenant ownership verification ──
    const ownership = await validateTenantOwnership(userId, tenantId);

    if (!ownership) {
      return NextResponse.json({ error: 'Forbidden - tenant access denied' }, { status: 403 });
    }

    // ── STEP 4: Atomic transaction using Supabase RPC with scoped context ──
    const { data: result, error: transactionError } = await supabase.rpc('update_tenant_config_with_greeting', {
      p_tenant_id: tenantId,
      p_config_patch: configPatch,
      p_ai_settings: aiSettings || {},
      p_updated_at: new Date().toISOString()
    });

    if (transactionError) {
      console.error('[UpdateConfig] RPC error:', transactionError);
      
      // Fallback to non-transactional update if RPC fails
      console.warn('[UpdateConfig] RPC failed, falling back to direct update with deep-merge');

      // Fetch existing widget_config to deep-merge
      const { data: existingTenant, error: fetchError } = await supabase
        .from('tenants')
        .select('widget_config')
        .eq('id', tenantId)
        .eq('reseller_id', ownership.resellerId)
        .single();

      if (fetchError) {
        console.error('[UpdateConfig] Fallback fetch error:', fetchError);
        return NextResponse.json({ error: 'Failed to fetch tenant configuration' }, { status: 500 });
      }

      // Deep merge helper
      function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
        const output = { ...target };
        for (const key of Object.keys(source)) {
          if (
            source[key] !== null &&
            typeof source[key] === 'object' &&
            !Array.isArray(source[key]) &&
            typeof target[key] === 'object' &&
            target[key] !== null &&
            !Array.isArray(target[key])
          ) {
            output[key] = deepMerge(target[key] as Record<string, unknown>, source[key] as Record<string, unknown>);
          } else {
            output[key] = source[key];
          }
        }
        return output;
      }

      const existingWidgetConfig = (existingTenant?.widget_config as Record<string, unknown>) || {};
      const mergedWidgetConfig = deepMerge(existingWidgetConfig, {
        ...configPatch,
        ai_settings: aiSettings || {},
      });

      const { data: tenantData, error: tenantError } = await supabase
        .from('tenants')
        .update({
          widget_config: mergedWidgetConfig,
          updated_at: new Date().toISOString()
        })
        .eq('id', tenantId)
        .eq('reseller_id', ownership.resellerId)
        .select('id, name')
        .single();

      if (tenantError) {
        console.error('Fallback update error:', tenantError);
        return NextResponse.json({ error: 'Failed to update tenant configuration' }, { status: 500 });
      }

      console.log(`✨ Voice-Visual Harmony: Updated ${tenantData.name} with new branding and greeting (fallback)`);

      return NextResponse.json({
        success: true,
        message: 'Configuration and greeting updated successfully',
        tenant: tenantData,
        fallback: true
      });
    }

    console.log(`✨ Voice-Visual Harmony: Transaction completed successfully for tenant ${tenantId}`);

    return NextResponse.json({
      success: true,
      message: 'Configuration and greeting updated successfully',
      tenant: result,
      transaction: true
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[API] update-config-with-greeting error:', error);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
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