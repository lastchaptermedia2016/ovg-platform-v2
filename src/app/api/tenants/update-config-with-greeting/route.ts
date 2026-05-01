import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { tenantId, configPatch, aiSettings } = await request.json();

    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant ID is required' }, { status: 400 });
    }

    // Use service client for admin operations
    const serviceClient = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Start transaction by updating tenant with greeting in widget_config
    const { data: tenantData, error: tenantError } = await serviceClient
      .from('tenants')
      .update({
        widget_config: {
          ...configPatch,
          ai_settings: aiSettings // Store ai_settings within widget_config for now
        },
        updated_at: new Date().toISOString()
      })
      .eq('id', tenantId)
      .select('id, name')
      .single();

    if (tenantError) {
      console.error('Tenant update error:', tenantError);
      return NextResponse.json({ error: 'Failed to update tenant configuration' }, { status: 500 });
    }

    console.log(`✨ Voice-Visual Harmony: Updated ${tenantData.name} with new branding and greeting`);

    return NextResponse.json({
      success: true,
      message: 'Configuration and greeting updated successfully',
      tenant: tenantData
    });

  } catch (error: any) {
    console.error('[API] update-config-with-greeting error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
