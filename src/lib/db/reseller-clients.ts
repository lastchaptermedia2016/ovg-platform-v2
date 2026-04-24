import { supabase } from "@/lib/supabase";
import { Tenant, TenantSchema } from "@/types";
import { unstable_noStore } from "next/cache";
import { generateTenantId } from "@/lib/utils/slugify";

/**
 * Validate UUID format
 * @param id - The string to validate
 * @returns true if valid UUID, false otherwise
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
 * This query ensures data isolation at the database level - never filter in frontend
 *
 * @param resellerId - The UUID of the reseller
 * @returns Array of clients belonging only to this reseller
 */
export async function getResellerClients(
  resellerId: string
): Promise<ResellerClient[]> {
  if (!isValidUUID(resellerId)) {
    console.error(`Invalid UUID format for Reseller ID: ${resellerId}`);
    return [];
  }

  const { data, error } = await supabase
    .from("tenants")
    .select("id, tenant_id, reseller_id, name, branding_colors, custom_assets, show_ovg_branding, pricing_tier_key, voice_id, system_prompt, is_active, created_at, updated_at")
    .eq("reseller_id", resellerId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error(`Error fetching clients for reseller ${resellerId}:`, {
      message: error.message,
      code: error.code,
      hint: error.hint,
      details: error.details,
    });
    return [];
  }

  if (!data || data.length === 0) {
    return [];
  }

  // Runtime validation with Zod
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
 * Used to lookup reseller UUID from the URL slug
 */
export async function getResellerBySlug(slug: string): Promise<{ id: string; name: string; tenant_id: string } | null> {
  unstable_noStore(); // Bypass Next.js caching

  const { data, error } = await supabase
    .from("resellers")
    .select("*")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    console.error("🚨 SQL ERROR DETAILS:", {
      message: error?.message,
      code: error?.code,
      hint: error?.hint,
      details: error?.details
    });
    return null;
  }

  if (!data) {
    console.log(`ℹ️ No reseller found for slug: ${slug}`);
    return null;
  }

  console.log(`✅ Found reseller:`, data);
  return data;
}

/**
 * Get client count for a reseller
 * Useful for showing stats on dashboard
 */
export async function getResellerClientCount(resellerId: string): Promise<number> {
  if (!isValidUUID(resellerId)) {
    console.error(`Invalid UUID format for Reseller ID: ${resellerId}`);
    return 0;
  }

  const { count, error } = await supabase
    .from("tenants")
    .select("*", { count: "exact", head: true })
    .eq("reseller_id", resellerId);

  if (error) {
    console.error(`Error counting clients for reseller ${resellerId}:`, {
      message: error.message,
      code: error.code,
      hint: error.hint,
      details: error.details,
    });
    return 0;
  }

  return count || 0;
}

/**
 * Get the first available reseller from the resellers table
 * Used as a temporary development bridge until Auth session is fully wired
 * @returns The first reseller's ID or null if none exists
 */
export async function getFirstReseller(): Promise<{ id: string } | null> {
  const { data, error } = await supabase
    .from("resellers")
    .select("id")
    .eq("is_active", true)
    .limit(1)
    .single();

  if (error) {
    console.error("Error fetching first reseller:", error);
    return null;
  }

  return data;
}

/**
 * Seed a test reseller if none exists
 * This is for development purposes only
 * @returns The created or existing reseller ID
 */
export async function seedTestReseller(): Promise<string> {
  const existing = await getFirstReseller();
  if (existing) {
    return existing.id;
  }

  // Create a test reseller
  const { data, error } = await supabase
    .from("resellers")
    .insert({
      name: "Test Reseller",
      slug: "test-reseller",
      email: "test@example.com",
      branding_colors: {
        primary: "#0097b2",
        secondary: "#226683",
      },
      branding_assets: {
        header_url: null,
        footer_url: null,
      },
      pricing_tiers: {},
      is_active: true,
    })
    .select("id")
    .single();

  if (error) {
    console.error("Error seeding test reseller:", error);
    throw new Error("Failed to seed test reseller");
  }

  return data.id;
}

/**
 * Seed a test tenant for a reseller
 * This is for development purposes only
 * @param resellerId - The reseller ID to associate the tenant with
 * @param name - The tenant name (will be slugified for tenant_id)
 * @returns The created tenant
 */
export async function seedTestTenant(resellerId: string, name: string = "Test Client") {
  const tenantId = generateTenantId(name);

  const { data, error } = await supabase
    .from("tenants")
    .insert({
      tenant_id: tenantId,
      reseller_id: resellerId,
      name: name,
      branding_colors: {
        primary: "#0097b2",
        secondary: "#226683",
      },
      custom_assets: {
        header_url: null,
        footer_url: null,
      },
      show_ovg_branding: false,
      pricing_tier_key: "basic",
      voice_id: null,
      system_prompt: null,
      is_active: true,
    })
    .select()
    .single();

  if (error) {
    console.error("Error seeding test tenant:", error);
    throw new Error("Failed to seed test tenant");
  }

  return data;
}
