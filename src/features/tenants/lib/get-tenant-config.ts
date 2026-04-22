import { supabaseAdmin } from "@/lib/supabase/admin";

export interface TenantConfig {
  systemPrompt?: string;
  aiName?: string;
  voiceId?: string;
  canopyEndpoint?: string;
}

export async function getTenantConfig(
  tenantSlug: string,
): Promise<TenantConfig | null> {
  try {
    const { data: tenant, error } = await supabaseAdmin
      .from("tenants")
      .select("branding")
      .eq("slug", tenantSlug)
      .single();

    if (error || !tenant) {
      return null;
    }

    return {
      systemPrompt: tenant?.branding?.systemPrompt,
      aiName: tenant?.branding?.aiName,
      voiceId: tenant?.branding?.voiceId,
      canopyEndpoint: tenant?.branding?.canopyEndpoint,
    };
  } catch (error) {
    console.error("Error fetching tenant config:", error);
    return null;
  }
}
