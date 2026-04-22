"use server";

import { supabase } from "@/lib/supabase";

export async function getTenantData(slug: string) {
  try {
    const { data, error } = await supabase
      .from("tenants")
      .select("id, name, branding")
      .eq("slug", slug)
      .single();

    if (error) throw error;

    return data;
  } catch (error) {
    console.error("Error fetching tenant data:", error);
    return null;
  }
}
