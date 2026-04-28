import { createClient } from "@/lib/supabase/server";
import { TenantSchema } from "@/types";
import { unstable_noStore } from "next/cache";
import { generateTenantId } from "@/lib/utils/slugify";

/**
 * Validate UUID format
 */
function isValidUUID(id: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
}

export interface ResellerClient {
  id: string;
  tenant_id: string;
  reseller_id: string;
  name: string;
  branding_colors: {
    primary: string;
    secondary: string;
  } | null;
  custom_assets: {
    header_url: string | null;
    footer_url: string | null;
  } | null;
  show_ovg_branding: boolean;
  pricing_tier_key: string | null;
  voice_id: string | null;
  system_prompt: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Get all tenants/clients for a specific reseller with STRICT isolation
 */
export async function getResellerClients(
  resellerId: string
): Promise<ResellerClient[]> {
  if (!isValidUUID(resellerId)) {
    console.error(`Invalid UUID format for Reseller ID: ${resellerId}`);
    return [];
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("tenants")
    .select("id, tenant_id, reseller_id, name, branding_colors, custom_assets, show_ovg_branding, pricing_tier_key, voice_id, system_prompt, is_active, created_at, updated_at")
    .eq("reseller_id", resellerId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error(`Error fetching clients for reseller ${resellerId}:`, error);
    return [];
  }

  if (!data || data.length === 0) {
    return [];
  }

  const validatedClients = data.map((client) => {
    try {
      const parsed = TenantSchema.parse(client);
      return {
        id: parsed.id,
        tenant_id: parsed.tenant_id,
        reseller_id: parsed.reseller_id,
        name: parsed.name,
        branding_colors: parsed.branding_colors || null,
        custom_assets: parsed.custom_assets || null,
        show_ovg_branding: parsed.show_ovg_branding,
        pricing_tier_key: parsed.pricing_tier_key || null,
        voice_id: parsed.voice_id,
        system_prompt: parsed.system_prompt,
        is_active: parsed.is_active,
        created_at: parsed.created_at || "",
        updated_at: parsed.updated_at || "",
      } as ResellerClient;
    } catch (err) {
      console.error(`Validation error for client ${client.tenant_id}:`, err);
      return null;
    }
  }).filter((client): client is ResellerClient => client !== null);

  return validatedClients;
}

/**
 * Get reseller by their slug/tenant_id
 */
export async function getResellerBySlug(slug: string): Promise<any | null> {
  unstable_noStore();
  
  console.log('Fetching reseller for slug:', slug);

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("resellers")
    .select("*")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    console.error("SQL ERROR:", error);
    
    // RLS Violation Warning
    if (error.code === 'PGRST116' || error.message.includes('permission denied')) {
      console.warn('⚠️ RLS VIOLATION WARNING: The query failed due to Row Level Security policies.');
      console.warn('   This may indicate that the current user does not have permission to access this reseller.');
      console.warn('   Slug:', slug);
      console.warn('   Check your Supabase RLS policies for the "resellers" table.');
    }
    
    return null;
  }

  if (!data) {
    console.log(`No reseller found for slug: ${slug}`);
    return null;
  }

  console.log('Reseller found:', data.slug, data.name);
  return data;
}

/**
 * Get client count for a reseller
 */
export async function getResellerClientCount(resellerId: string): Promise<number> {
  if (!isValidUUID(resellerId)) {
    console.error(`Invalid UUID format for Reseller ID: ${resellerId}`);
    return 0;
  }

  const supabase = await createClient();

  const { count, error } = await supabase
    .from("tenants")
    .select("*", { count: "exact", head: true })
    .eq("reseller_id", resellerId);

  if (error) {
    console.error(`Error counting clients for reseller ${resellerId}:`, error);
    return 0;
  }

  return count || 0;
}
