import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

// Production Excellence: Zod schema for request validation
const UpdateConfigSchema = z.object({
  tenantId: z.string().uuid(),
  configPatch: z.record(z.any()),
  aiSettings: z.record(z.any()).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate request body
    const validationResult = UpdateConfigSchema.safeParse(body);
    if (!validationResult.success) {
      console.error('[UpdateConfig] Validation error:', validationResult.error.flatten());
      return NextResponse.json({ 
        error: 'Invalid request body', 
        details: validationResult.error.flatten() 
      }, { status: 400 });
    }

    const { tenantId, configPatch, aiSettings } = validationResult.data;

    // Use service client for admin operations with transaction safety
    const serviceClient = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Production Excellence: Atomic transaction using Supabase RPC
    const { data: result, error: transactionError } = await serviceClient.rpc('update_tenant_config_with_greeting', {
      p_tenant_id: tenantId,
      p_config_patch: configPatch,
      p_ai_settings: aiSettings || {},
      p_updated_at: new Date().toISOString()
    });

    if (transactionError) {
      console.error('Transaction error:', transactionError);
      
      // Fallback to non-transactional update if RPC fails
      console.warn('[UpdateConfig] RPC failed, falling back to direct update');
      
      const { data: tenantData, error: tenantError } = await serviceClient
        .from('tenants')
        .update({
          widget_config: {
            ...configPatch,
            ai_settings: aiSettings || {}
          },
          updated_at: new Date().toISOString()
        })
        .eq('id', tenantId)
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
