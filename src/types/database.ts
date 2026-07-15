import { z } from "zod";

export const TenantSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string(),
  reseller_id: z.string().uuid().nullable().optional(),
  name: z.string(),
  branding_colors: z
    .preprocess(
      (val) => {
        if (typeof val === "string") {
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
  custom_assets: z
    .object({
      header_url: z.string().nullable(),
      footer_url: z.string().nullable(),
    })
    .optional(),
  show_ovg_branding: z.boolean().default(false),
  pricing_tier_key: z.string().optional(),
  voice_id: z.string().nullable(),
  preferred_voice: z.string().default("hannah"),
  system_prompt: z.string().nullable(),
  is_active: z.boolean().default(true),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export type Tenant = z.infer<typeof TenantSchema>;

export interface ResellerRecord {
  id: string;
  tenant_id: string;
  name: string;
  owner_email: string;
  is_active: boolean;
  version_stamp: number;
  logo_url?: string | null;
  branding_colors: {
    primary: string;
    secondary: string;
  };
  branding_assets: {
    header_url: string | null;
    footer_url: string | null;
  };
  // Legacy compatibility
  branding_color: string;
  accent_color: string;
  email: string;
  created_at?: string;
  updated_at?: string;
  stripe_account_id?: string | null;
}
