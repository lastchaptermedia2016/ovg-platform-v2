import { supabase } from "@/lib/supabase";
import { z } from "zod";

// Safe Version of TenantSchema with .transform() for branding_colors
const TenantSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string(),
  reseller_id: z.string().uuid().nullable().optional(),
  name: z.string(),
  branding_colors: z.preprocess(
    (val) => {
      if (typeof val === 'string') {
        try {
          return JSON.parse(val);
        } catch {
          return {};
        }
      }
      return val || {};
    },
    z.record(z.any()).optional().default({})
  ),
  custom_assets: z.object({
    header_url: z.string().nullable(),
    footer_url: z.string().nullable(),
  }).optional(),
  show_ovg_branding: z.boolean().default(false),
  pricing_tier_key: z.string().optional(),
  voice_id: z.string().nullable(),
  preferred_voice: z.string().default('hannah'),
  system_prompt: z.string().nullable(),
  is_active: z.boolean().default(true),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export type Tenant = z.infer<typeof TenantSchema>;

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
