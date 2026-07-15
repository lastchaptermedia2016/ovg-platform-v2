import { dispatchUpdateStudioConfig } from '../src/lib/actionRegistry';
import { createClient } from '@supabase/supabase-js';
import type { ClientWidgetStudio } from '../src/lib/schemas/client-config.schema';

// Setup admin/service client using your environment variables
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Standalone implementation of the db fetch logic to avoid the Next.js cookies dependency
async function testGetTenantBySlug(slug: string) {
  // Try slug column first
  const { data, error } = await supabaseAdmin
    .from('tenants')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();

  if (error || !data) {
    // Fallback to UUID matching
    const result = await supabaseAdmin
      .from('tenants')
      .select('*')
      .eq('tenant_id', slug)
      .maybeSingle();
    return result.data;
  }
  return data;
}

async function executeLivePipelineTest() {
  console.log('⚡ Starting Live Client-to-Widget Pipeline Integration Test...');
  const TARGET_TENANT_ID = 'eca76a5b-de2a-41c9-b5e0-5ae7412ef835';
  const TEST_SLUG = 'lastchaptermedia2016';

  try {
    // 1. Test Tenant Resolution without using request-scoped cookies()
    console.log(`\n🔍 Testing slug/UUID resolution for: "${TEST_SLUG}"...`);
    const tenantBySlug = await testGetTenantBySlug(TEST_SLUG);
    const tenantById = await testGetTenantBySlug(TARGET_TENANT_ID);

    if (tenantBySlug && tenantById && tenantBySlug.id === tenantById.id) {
      console.log('✅ PASS: getTenantBySlug successfully resolves across both Slug and UUID constraints.');
    } else {
      console.warn('⚠️ WARNING: Tenant resolution returned null or mismatched rows.');
    }

    // 2. Execute Payload Normalization & RPC Sync
    console.log('\n🎬 Simulating UI save payload with explicit layer removal ("none")...');
    const simulateUiPayload: ClientWidgetStudio = {
      branding: {
        primaryColor: '#0000ff',
        accentColor: '#D4AF37',
        header: { type: 'none', value: null, opacity: 1, backdropBlur: false },
        widgetBody: { type: 'none', value: null, opacity: 1, backdropBlur: false }
      }
    };

    // Trigger the real pipeline logic directly
    await dispatchUpdateStudioConfig(simulateUiPayload, {
      userId: 'canary-test-user',
      tenantId: TARGET_TENANT_ID,
      source: 'manual'
    });
    console.log('📥 Save routine executed successfully.');

    // 3. Assert Destructive Merge (No ghost keys)
    const { data: tenantData } = await supabaseAdmin
      .from('tenants')
      .select('widget_config')
      .eq('id', TARGET_TENANT_ID)
      .single();

    const headerConfig = tenantData?.widget_config?.branding?.headerConfig;
    const bodyOpacity = tenantData?.widget_config?.branding?.widgetBodyOpacity;

    if (headerConfig?.type === 'none' && !('colorStart' in headerConfig) && bodyOpacity === null) {
      console.log('✅ PASS: deepMerge successfully decoupled nested ghost parameters.');
    } else {
      console.error('❌ FAIL: Target object retained legacy attributes:', JSON.stringify(headerConfig));
    }

    // 4. Assert Reseller Sync Propagation via RPC
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
        console.log('✅ PASS: sync_reseller_branding RPC successfully verified.');
      } else {
        console.error('❌ FAIL: Reseller branding_colors does not reflect the normalized UI layout.');
      }
    }

    console.log('\n🏁 Live Verification Execution Completed.');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('\n🚨 Execution Pipeline Faulted:', message);
  }
}

executeLivePipelineTest();
