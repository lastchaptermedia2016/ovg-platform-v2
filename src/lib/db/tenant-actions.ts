import { supabase } from "@/lib/supabase";

/**
 * updateTenantPolicy - Update tenant policy settings
 * 
 * This function updates specific policy fields for a tenant.
 * RLS policies on the tenants table ensure only the owning reseller can perform updates.
 * 
 * @param tenantId - The UUID of the tenant
 * @param resellerId - The UUID of the reseller (for RLS verification)
 * @param updates - Policy updates to apply
 * @returns The updated tenant record
 */
export async function updateTenantPolicy(
  tenantId: string,
  resellerId: string,
  updates: {
    show_ovg_branding?: boolean;
    pricing_tier_key?: string;
    custom_assets?: {
      header_url?: string | null;
      footer_url?: string | null;
    };
  }
) {
  const { data, error } = await supabase
    .from('tenants')
    .update(updates)
    .eq('id', tenantId)
    .eq('reseller_id', resellerId)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update tenant policy: ${error.message}`);
  }

  return data;
}

/**
 * getTenantPolicy - Fetch tenant policy settings
 * 
 * @param tenantId - The UUID of the tenant
 * @param resellerId - The UUID of the reseller (for RLS verification)
 * @returns The tenant policy settings
 */
export async function getTenantPolicy(
  tenantId: string,
  resellerId: string
) {
  const { data, error } = await supabase
    .from('tenants')
    .select('id, name, show_ovg_branding, pricing_tier_key, custom_assets')
    .eq('id', tenantId)
    .eq('reseller_id', resellerId)
    .single();

  if (error) {
    throw new Error(`Failed to fetch tenant policy: ${error.message}`);
  }

  return data;
}
