import type { CanonicalBranding, LayerConfig } from "@/lib/schemas/tenant-config.canonical";

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

export function generateBrandingCSS(branding: CanonicalBranding): string {
  const vars: string[] = [];

  if (branding.primaryColor) {
    vars.push(`--w-primary: ${branding.primaryColor};`);
  }
  if (branding.accentColor) {
    vars.push(`--w-accent: ${branding.accentColor};`);
  }
  if (branding.logoUrl) {
    vars.push(`--w-logo: url('${branding.logoUrl}');`);
  }

  vars.push(...layerVars("header", branding.header));
  vars.push(...layerVars("footer", branding.footer));
  vars.push(...layerVars("body", branding.widgetBody));

  if (branding.widgetPosition) {
    vars.push(`--w-position: ${branding.widgetPosition};`);
  }

  if (branding.customCssCode) {
    vars.push(branding.customCssCode);
  }

  return `:root {\n  ${vars.join("\n  ")}\n}`;
}
