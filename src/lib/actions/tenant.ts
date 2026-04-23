"use server";

import { supabase } from "@/lib/supabase";
import { Tenant, TenantSchema } from "@/types";

export async function getTenantData(slug: string): Promise<Tenant | null> {
  try {
    const { data, error } = await supabase
      .from("tenants")
      .select("id, slug, name, branding_color, voice_id, system_prompt")
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
