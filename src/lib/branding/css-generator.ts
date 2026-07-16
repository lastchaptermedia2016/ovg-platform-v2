import type { CanonicalBranding, LayerConfig } from "@/lib/schemas/tenant-config.canonical";
import type { BrandingData } from "@/types";

function hexToRgb(hex: string): string {
  const normalized = hex.replace(/^#/, "");
  if (normalized.length !== 6) return "0, 0, 0";
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `${r}, ${g}, ${b}`;
}

function layerVars(prefix: string, layer: LayerConfig | undefined): string[] {
  if (!layer) return [];

  if (layer.type === "none") {
    return [
      `--w-${prefix}-opacity: 0;`,
      `--w-${prefix}-backdrop-blur: 0px;`,
    ];
  }

  const vars: string[] = [];
  const safeValue = layer.value?.trim();

  if ((layer.type === "solid" || layer.type === "gradient") && safeValue) {
    if (safeValue.startsWith("#")) {
      vars.push(`--w-${prefix}-bg-rgb: ${hexToRgb(safeValue)};`);
    } else {
      vars.push(`--w-${prefix}-bg: ${safeValue};`);
    }
  }

  vars.push(`--w-${prefix}-opacity: ${layer.opacity};`);
  vars.push(
    `--w-${prefix}-backdrop-blur: ${layer.backdropBlur ? "10px" : "0px"};`
  );

  return vars;
}

/**
 * Theme-bridge: map a branding payload onto the active `--w-*` CSS variable
 * set consumed by the ChatWidget and Zeeder UI.
 *
 * Accepts both of the platform's branding shapes:
 * - `CanonicalBranding` — the full Studio config (header/footer/body layers,
 *   widget position, custom CSS) injected into the Studio preview.
 * - `BrandingData` — the flat reseller payload sourced from the live
 *   `resellers.branding_colors` JSONB. This is the run-time counterpart that
 *   makes the database-driven reseller theme reach the widget's `--w-primary` /
 *   `--w-accent` consumers (not just the Studio-preview config).
 *
 * When a `CanonicalBranding` is passed, the layered variables are also emitted.
 *
 * @param branding - The branding payload.
 * @param options.accentFallback - Brand accent fallback used when no accent is set.
 */
export function generateBrandingCSS(
  branding: CanonicalBranding,
  options?: { accentFallback?: string },
): string;
export function generateBrandingCSS(
  branding: BrandingData,
  options?: { accentFallback?: string },
): string;
export function generateBrandingCSS(
  branding: CanonicalBranding | BrandingData,
  _options?: { accentFallback?: string },
): string {
  // Resolve both shapes onto the shared `--w-*` variable contract.
  const canonical = branding as CanonicalBranding;
  const flat = branding as BrandingData;
  const primary = canonical.primaryColor ?? flat.primaryColor;
  const accent = canonical.accentColor ?? flat.accentColor;
  const logoUrl = canonical.logoUrl ?? flat.logoUrl;

  const vars: string[] = [];

  if (primary) {
    vars.push(`--w-primary: ${primary};`);
  }
  if (accent) {
    vars.push(`--w-accent: ${accent};`);
  }
  if (logoUrl) {
    vars.push(`--w-logo: url('${logoUrl}');`);
  }

  // Only CanonicalBranding carries layered section config.
  if (canonical.header || canonical.footer || canonical.widgetBody || canonical.widgetPosition || canonical.customCssCode) {
    vars.push(...layerVars("header", canonical.header));
    vars.push(...layerVars("footer", canonical.footer));
    vars.push(...layerVars("body", canonical.widgetBody));

    if (canonical.widgetPosition) {
      vars.push(`--w-position: ${canonical.widgetPosition};`);
    }

    if (canonical.customCssCode) {
      vars.push(canonical.customCssCode);
    }
  }

  return `:root {\n  ${vars.join("\n  ")}\n}`;
}
