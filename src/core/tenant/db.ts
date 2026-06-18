import { createClient } from "@/lib/supabase/server";
import { TenantSchema, type Tenant } from "@/types/database";

export type { Tenant };

// Safe parse function that returns null on validation errors
export function safeParseTenant(data: unknown): Tenant | null {
  const result = TenantSchema.safeParse(data);
  if (result.success) {
    return result.data;
  }
  console.error("Tenant validation error:", result.error);
  return null;
}

export async function getTenantBySlug(slug: string): Promise<Tenant | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("tenants")
      .select("*")
      .eq("tenant_id", slug)
      .single();

    if (error) {
      console.error(`Error fetching tenant by tenant_id "${slug}":`, error);
      return null;
    }

    if (!data) {
      return null;
    }

    // Use safeParseTenant instead of direct .parse()
    const validatedTenant = safeParseTenant(data);
    return validatedTenant;
  } catch (error) {
    console.error(`Unexpected error fetching tenant by tenant_id "${slug}":`, error);
    return null;
  }
}
