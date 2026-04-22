"use server";

import { supabase } from "@/lib/supabase";
import { Tenant, TenantSchema } from "@/types";

export async function getTenantData(slug: string): Promise<Tenant | null> {
  try {
    const { data, error } = await supabase
      .from("tenants")
      .select("id, tenant_id, name, system_prompt, preferred_voice, branding")
      .eq("slug", slug)
      .single();

    if (error) throw error;

    if (!data) return null;

    // Runtime validation with Zod to ensure DB schema matches TypeScript types
    const validatedTenant = TenantSchema.parse(data);
    return validatedTenant;
  } catch (error) {
    return null;
  }
}
