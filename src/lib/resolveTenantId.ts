import type { PostgrestError } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';

export interface ResolveTenantIdResult {
  data: string | null;
  error: PostgrestError | Error | null;
}

/**
 * Resolve the tenant UUID for an authenticated user.
 * 
 * Lookup chain:
 * 1. user_resellers table: user_id → reseller_id
 * 2. tenants table: reseller_id → tenant.id (UUID primary key)
 * 
 * @param userId - The authenticated user's UUID
 * @returns The tenant UUID (tenants.id), or null if not found
 */
export async function resolveTenantId(
  userId: string,
): Promise<ResolveTenantIdResult> {
  const trimmed = userId.trim();

  if (!trimmed) {
    return { data: null, error: new Error('Empty userId passed to resolveTenantId') };
  }

  const supabase = createClient();

  // Step 1: Get the reseller_id from user_resellers table
  const { data: userResellerData, error: userResellerError } = await supabase
    .from('user_resellers')
    .select('reseller_id')
    .eq('user_id', trimmed)
    .maybeSingle();

  if (userResellerError) {
    return { data: null, error: userResellerError };
  }

  if (!userResellerData?.reseller_id) {
    return { data: null, error: new Error('No reseller association found for user') };
  }

  const resellerId = userResellerData.reseller_id as string;

  // Step 2: Get tenants belonging to this reseller
  const { data: tenantsData, error: tenantsError } = await supabase
    .from('tenants')
    .select('id')
    .eq('reseller_id', resellerId);

  if (tenantsError) {
    return { data: null, error: tenantsError };
  }

  if (!tenantsData || tenantsData.length === 0) {
    return { data: null, error: new Error('No tenants found for this reseller') };
  }

  if (tenantsData.length > 1) {
    console.warn(
      '[resolveTenantId] Multiple tenants found - returning first one. Multi-tenant selection not yet implemented.',
      { count: tenantsData.length, tenantIds: tenantsData.map((t) => t.id) }
    );
  }

  // Return the first tenant's UUID (id column, NOT tenant_id slug)
  return { data: tenantsData[0].id as string, error: null };
}