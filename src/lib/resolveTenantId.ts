import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';

export interface ResolveTenantIdResult {
  data: string | null;
  widget_config: Record<string, unknown> | null;
  error: PostgrestError | Error | null;
}

/**
 * Resolve the tenant UUID for an authenticated user.
 * 
 * Lookup chain:
 * 1. If clientId is provided, fetch that specific tenant by UUID
 * 2. user_resellers table: user_id → reseller_id
 * 3. tenants table: reseller_id → tenant.id (UUID primary key)
 * 
 * @param userId - The authenticated user's UUID
 * @param supabase - Optional Supabase client. When omitted, the browser client is
 *   used (correct for client components that already carry the user's session).
 *   Server route handlers must pass an authenticated server client (e.g.
 *   `createAuthClient()`) so that RLS policies keyed on `auth.uid()` resolve.
 * @param clientId - Optional specific tenant UUID to resolve. When provided,
 *   returns this tenant directly (bypasses reseller_id scan). Use this when
 *   the user has selected a specific client in a multi-tenant reseller stable.
 * @returns The tenant UUID (tenants.id), or null if not found
 */
export async function resolveTenantId(
  userId: string,
  supabase?: SupabaseClient,
  clientId?: string,
): Promise<ResolveTenantIdResult> {
  const trimmed = userId.trim();

  if (!trimmed) {
    return { data: null, widget_config: null, error: new Error('Empty userId passed to resolveTenantId') };
  }

  const client = supabase ?? createClient();

  // Step 1: If clientId is provided, fetch that specific tenant directly
  if (clientId) {
    const { data: tenantData, error: tenantError } = await client
      .from('tenants')
      .select('id, widget_config')
      .eq('id', clientId)
      .maybeSingle();

    if (tenantError) {
      return { data: null, widget_config: null, error: tenantError };
    }

    if (tenantData) {
      return {
        data: tenantData.id as string,
        widget_config: (tenantData.widget_config as Record<string, unknown> | null | undefined) ?? null,
        error: null,
      };
    }

    // Fall through to reseller-based lookup if clientId not found
    console.warn(`[resolveTenantId] clientId "${clientId}" not found, falling back to reseller lookup`);
  }

  // Step 2: Get the reseller_id and active_tenant_id from user_resellers table
  const { data: userResellerData, error: userResellerError } = await client
    .from('user_resellers')
    .select('reseller_id, active_tenant_id')
    .eq('user_id', trimmed)
    .maybeSingle();

  if (userResellerError) {
    return { data: null, widget_config: null, error: userResellerError };
  }

  if (!userResellerData?.reseller_id) {
    return { data: null, widget_config: null, error: new Error('No reseller association found for user') };
  }

  const resellerId = userResellerData.reseller_id as string;
  const activeTenantId = userResellerData.active_tenant_id as string | undefined;

  // Step 3a: If active_tenant_id is set, fetch that specific tenant directly
  if (activeTenantId) {
    const { data: activeTenant, error: activeTenantError } = await client
      .from('tenants')
      .select('id, widget_config')
      .eq('id', activeTenantId)
      .maybeSingle();

    if (activeTenantError) {
      console.warn('[resolveTenantId] active_tenant_id lookup failed, falling back to reseller scan', activeTenantError);
    } else if (activeTenant) {
      return {
        data: activeTenant.id as string,
        widget_config: (activeTenant.widget_config as Record<string, unknown> | null | undefined) ?? null,
        error: null,
      };
    }
  }

  // Step 3b: Fallback - get tenants belonging to this reseller
  const { data: tenantsData, error: tenantsError } = await client
    .from('tenants')
    .select('id, widget_config')
    .eq('reseller_id', resellerId);

  if (tenantsError) {
    return { data: null, widget_config: null, error: tenantsError };
  }

  if (!tenantsData || tenantsData.length === 0) {
    return { data: null, widget_config: null, error: new Error('No tenants found for this reseller') };
  }

  if (tenantsData.length > 1) {
    console.warn(
      '[resolveTenantId] Multiple tenants found - returning first one. Multi-tenant selection not yet implemented.',
      { count: tenantsData.length, tenantIds: tenantsData.map((t) => t.id) }
    );
  }

  // Return the first tenant's UUID (id column, NOT tenant_id slug)
  return { 
    data: tenantsData[0].id as string, 
    widget_config: (tenantsData[0].widget_config as Record<string, unknown> | null | undefined) ?? null,
    error: null 
  };
}
