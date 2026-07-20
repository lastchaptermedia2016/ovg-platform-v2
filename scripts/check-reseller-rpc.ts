import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const TARGET_TENANT_ID = 'eca76a5b-de2a-41c9-b5e0-5ae7412ef835';

async function main() {
  // 1. Inspect live RPC definition
  console.log('=== Inspecting live sync_reseller_branding RPC ===');
  const { data: routines, error: routinesError } = await supabaseAdmin
    .from('routines')
    .select('routine_name, routine_schema, routine_definition')
    .eq('routine_name', 'sync_reseller_branding')
    .eq('routine_schema', 'public');

  if (routinesError) {
    console.error('Failed to query routines:', routinesError);
  } else if (routines && routines.length > 0) {
    console.log('Routine definition:', routines[0].routine_definition);
  } else {
    console.log('No routine found via PostgREST routines view.');
  }

  // 2. Query information_schema.parameters to reconstruct signature
  const { data: params, error: paramsError } = await supabaseAdmin
    .from('parameters')
    .select('parameter_name, parameter_mode, data_type, ordinal_position')
    .eq('specific_schema', 'public')
    .eq('specific_name', 'sync_reseller_branding')
    .order('ordinal_position', { ascending: true });

  if (paramsError) {
    console.error('Failed to query parameters:', paramsError);
  } else {
    console.log('RPC parameters:', JSON.stringify(params, null, 2));
  }

  // 3. Lookup reseller for tenant
  console.log('\n=== Looking up reseller for tenant ===');
  const { data: tenantRecord, error: tenantError } = await supabaseAdmin
    .from('tenants')
    .select('reseller_id')
    .eq('id', TARGET_TENANT_ID)
    .single();

  if (tenantError || !tenantRecord?.reseller_id) {
    console.error('Tenant reseller lookup failed:', tenantError);
    return;
  }

  const { data: resellerRecord, error: resellerError } = await supabaseAdmin
    .from('resellers')
    .select('tenant_id')
    .eq('id', tenantRecord.reseller_id)
    .single();

  if (resellerError || !resellerRecord?.tenant_id) {
    console.error('Reseller lookup failed:', resellerError);
    return;
  }

  const resellerTenantId = resellerRecord.tenant_id;
  console.log('Reseller tenant_id:', resellerTenantId);

  // 4. Call the RPC directly with the same payload shape as actionRegistry.ts
  console.log('\n=== Calling sync_reseller_branding RPC ===');
  const { data: rpcResult, error: rpcError } = await supabaseAdmin.rpc(
    'sync_reseller_branding',
    {
      p_tenant_id: resellerTenantId,
      p_branding_bag: {
        primaryColor: '#0000ff',
        accentColor: '#D4AF37',
        logoUrl: null,
        favicon: null,
        metaTitle: null,
        metaDescription: null,
        typography: { headingFont: 'Inter', bodyFont: 'Inter' },
        borderRadius: 8,
        mode: 'light',
      },
      p_expected_version: 1,
    }
  );

  if (rpcError) {
    console.error('[dispatchUpdateStudioConfig] Reseller propagation failed:', rpcError.message);
    console.error('Full RPC error object:', JSON.stringify(rpcError, null, 2));
  } else {
    console.log('RPC succeeded:', JSON.stringify(rpcResult, null, 2));
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
