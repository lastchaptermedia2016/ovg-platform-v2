import { Reseller, Tenant } from "@/types";

export interface EffectiveBranding {
  header_url: string | null;
  footer_url: string | null;
  colors: {
    primary: string;
    secondary: string;
  } | null;
}

// System defaults
const SYSTEM_DEFAULTS = {
  primary: '#0097b2',
  secondary: '#226683',
};

/**
 * getEffectiveBranding - Implements inheritance logic for branding assets
 * Checks for reseller-specific overrides (#0097b2 / #226683) and falls back to system defaults
 */
export function getEffectiveBranding(
  reseller: Reseller,
  tenant: Tenant | null
): EffectiveBranding {
  const tenantHeaderUrl = tenant?.custom_assets?.header_url ?? null;
  const tenantFooterUrl = tenant?.custom_assets?.footer_url ?? null;
  const tenantColors = tenant?.branding_colors ?? null;

  // Use reseller colors if tenant doesn't have them, otherwise use system defaults
  const effectiveColors = tenantColors || reseller.branding_colors || SYSTEM_DEFAULTS;

  return {
    header_url: tenantHeaderUrl ?? reseller.branding_assets.header_url,
    footer_url: tenantFooterUrl ?? reseller.branding_assets.footer_url,
    colors: effectiveColors,
  };
}
