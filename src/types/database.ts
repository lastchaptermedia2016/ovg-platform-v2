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
      header_url: z.string().nullable().optional(),
      footer_url: z.string().nullable().optional(),
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

/**
 * ResellerRecord — Centralized type for reseller records from live database schema.
 * ⚠️ Aligned with live DB schema per PROJECT_STATUS.md audit (2026-07-20).
 * 
 * Live schema uses JSONB for branding state:
 * - branding_colors: { primary, secondary }
 * - branding: { primary, logo_url, secondary }
 * - branding_assets: flexible object (typically { header_url, footer_url })
 * - settings, metadata, pricing_tiers: flexible JSON containers
 * 
 * Note: Legacy scalar columns (branding_color, accent_color, branding_bag, version_stamp)
 * are ABSENT in live DB and should NOT be referenced.
 */
export interface ResellerRecord {
  id: string; // UUID PK
  tenant_id: string; // UUID, default gen_random_uuid()
  name: string; // TEXT NOT NULL
  slug: string; // TEXT NOT NULL UNIQUE (lowercase alphanumeric)
  owner_email: string; // TEXT UNIQUE (standardized per 20240618 migration)
  is_active: boolean | null; // BOOLEAN NULL, default true
  status?: string | null; // TEXT NULL, default 'active'
  logo_url?: string | null; // TEXT NULL
  branding_colors?: Record<string, unknown> | null; // JSONB NULL: { primary?, secondary? }
  branding?: Record<string, unknown> | null; // JSONB NULL: { primary?, logo_url?, secondary? }
  branding_assets?: Record<string, unknown> | null; // JSONB NULL: flexible structure
  settings?: Record<string, unknown> | null; // JSONB NULL: flexible structure
  metadata?: Record<string, unknown> | null; // JSONB NULL: flexible structure
  pricing_tiers?: Record<string, unknown> | null; // JSONB NULL: flexible structure
  stripe_account_id?: string | null; // TEXT NULL
  stripe_connect_id?: string | null; // TEXT NULL
  stripe_onboarding_complete?: boolean | null; // BOOLEAN NULL, default false
  created_at?: string | null; // TIMESTAMPTZ NULL
  updated_at?: string | null; // TIMESTAMPTZ NULL
}
