import { supabase } from "@/lib/supabase";
import { Tenant, TenantSchema } from "@/types";

export async function getTenantBySlug(slug: string): Promise<Tenant | null> {
  try {
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

    // Runtime validation with Zod to ensure DB schema matches TypeScript types
    const validatedTenant = TenantSchema.parse(data);
    return validatedTenant;
  } catch (error) {
    console.error(`Unexpected error fetching tenant by tenant_id "${slug}":`, error);
    return null;
  }
}
