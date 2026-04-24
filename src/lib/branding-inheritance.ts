import { Reseller, Tenant } from "@/types";

export interface EffectiveBranding {
  header_url: string | null;
  footer_url: string | null;
  colors: {
    primary: string;
    secondary: string;
  } | null;
}

/**
 * getEffectiveBranding - Implements inheritance logic for branding assets
 * 
 * Tenant branding overrides reseller branding where present.
 * Falls back to reseller defaults when tenant values are null/undefined.
 * 
 * @param reseller - The parent reseller object
 * @param tenant - The tenant object (may be null for reseller-level views)
 * @returns EffectiveBranding with merged values
 */
export function getEffectiveBranding(
  reseller: Reseller,
  tenant: Tenant | null
): EffectiveBranding {
  const tenantHeaderUrl = tenant?.custom_assets?.header_url ?? null;
  const tenantFooterUrl = tenant?.custom_assets?.footer_url ?? null;
  const tenantColors = tenant?.branding_colors ?? null;

  return {
    header_url: tenantHeaderUrl ?? reseller.branding_assets.header_url,
    footer_url: tenantFooterUrl ?? reseller.branding_assets.footer_url,
    colors: tenantColors ?? reseller.branding_colors,
  };
}
