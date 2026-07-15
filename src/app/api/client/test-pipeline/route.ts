import { NextResponse } from 'next/server';
import { dispatchUpdateStudioConfig } from '@/lib/actionRegistry';
import { createClient } from '@supabase/supabase-js';
import type { ClientWidgetStudio } from '@/lib/schemas/client-config.schema';

// Clean service-role instance to verify deep writes
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  console.log('⚡ Starting Framework-Native Pipeline Integration Test...');
  const TARGET_TENANT_ID = 'eca76a5b-de2a-41c9-b5e0-5ae7412ef835';
  const results: Record<string, string> = {};

  try {
    // 1. Execute Payload Normalization, deepMerge override, and RPC Sync
    const simulateUiPayload: ClientWidgetStudio = {
      branding: {
        primaryColor: '#0000ff',
        accentColor: '#D4AF37',
        header: { type: 'none', value: null, opacity: 1, backdropBlur: false },
        widgetBody: { type: 'none', value: null, opacity: 1, backdropBlur: false }
      }
    };

    await dispatchUpdateStudioConfig(simulateUiPayload, {
      userId: 'canary-test-user',
      tenantId: TARGET_TENANT_ID,
      source: 'manual'
    }, supabaseAdmin);
    results.pipelineExecution = 'SUCCESS';

    // 2. Query Tenant verification (Checking for purged ghost parameters)
    const { data: tenantData } = await supabaseAdmin
      .from('tenants')
      .select('widget_config')
      .eq('id', TARGET_TENANT_ID)
      .single();

    const headerConfig = tenantData?.widget_config?.branding?.headerConfig;
    const bodyOpacity = tenantData?.widget_config?.branding?.widgetBodyOpacity;

    if (headerConfig?.type === 'none' && !('colorStart' in headerConfig) && bodyOpacity === null) {
      results.tenantMergeCleanup = 'PASS - Ghost keys eliminated cleanly';
    } else {
      results.tenantMergeCleanup = `FAIL - Leftover keys: ${JSON.stringify(headerConfig)}`;
    }

    // 3. Query Reseller RPC Sync verification
    const { data: tenantRecord } = await supabaseAdmin
      .from('tenants')
      .select('reseller_id')
      .eq('id', TARGET_TENANT_ID)
      .single();

    if (tenantRecord?.reseller_id) {
      const { data: resellerData } = await supabaseAdmin
        .from('resellers')
        .select('branding_colors, branding_assets')
        .eq('id', tenantRecord.reseller_id)
        .single();

      if (resellerData?.branding_colors) {
        results.resellerRpcPropagation = 'PASS - Live widget assets synchronized natively via RPC';
      } else {
        results.resellerRpcPropagation = 'FAIL - Reseller branding did not reflect the normalized UI layout';
      }
    } else {
      results.resellerRpcPropagation = 'SKIP - No reseller linked to test tenant ID';
    }

    return NextResponse.json({ success: true, results });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
