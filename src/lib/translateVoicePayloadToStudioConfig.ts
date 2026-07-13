import type { CanonicalWidgetConfig } from '@/lib/schemas/tenant-config.canonical';
import { normalizeHexColor } from '@/lib/colors';

/**
 * Fast-path validation: a strict 6-character hex string starting with `#`.
 *
 * The widget styling controls only accept solid `#rrggbb` tokens for color
 * inputs — CSS gradients, rgb()/rgba(), named colors ("red"), and free text
 * ("gradient yellow and blue") are invalid CSS for a solid color field and
 * cause spurious component re-renders without a visual update. This guard lets
 * the translator drop such values so the existing valid color is preserved
 * (the downstream merge is partial — omitted keys are left untouched).
 */
const STRICT_HEX6_RE = /^#[0-9A-F]{6}$/i;
const isValidHex = (color: unknown): color is string =>
  typeof color === 'string' && STRICT_HEX6_RE.test(color);

/**
 * Normalize a raw color value and assign it to `target[key]` only when the
 * result is a clean strict-hex token. Raw phrases / gradients are skipped so
 * the current value is preserved by the partial merge downstream.
 */
function assignSolidHex(target: Record<string, unknown>, key: string, raw: unknown): void {
  if (raw === undefined) return;
  const normalized = normalizeHexColor(String(raw));
  if (isValidHex(normalized)) {
    target[key] = normalized;
  }
}

/**
 * Translate a SYSTEM_UPDATE_BRANDING voice payload (theme/ui/behavior shape)
 * into a partial CanonicalWidgetConfig-shaped object.
 *
 * Only includes fields that exist in the input — no defaults are invented
 * for missing fields.
 *
 * @param voicePayload - The raw payload from the LLM (theme/ui/behavior shape).
 * @returns The translated partial canonical widget config.
 */
export function translateVoicePayloadToStudioConfig(
  voicePayload: Record<string, unknown>
): { studioConfig: Partial<CanonicalWidgetConfig> } {
  const theme = voicePayload.theme as Record<string, unknown> | undefined;
  const ui = voicePayload.ui as Record<string, unknown> | undefined;
  const behavior = voicePayload.behavior as Record<string, unknown> | undefined;
  const aiPersonaRaw = voicePayload.aiPersona as Record<string, unknown> | undefined;
  const widget = voicePayload.widget as Record<string, unknown> | undefined;

  const branding: Record<string, unknown> = {};

  // Map widget.* -> branding.* (widget body properties emitted by the LLM
  // under payload.widget, per the STUDIO capabilities / system prompt).
  if (widget) {
    if (widget.bodyOpacity !== undefined) branding.widgetBodyOpacity = widget.bodyOpacity;
    if (widget.opacity !== undefined) branding.widgetBodyOpacity = widget.opacity; // legacy alias
    // widgetBodyBackground is a CSS background field (gradients allowed by the
    // schema), so it is normalized but not held to strict hex.
    if (widget.bodyBackground !== undefined) branding.widgetBodyBackground = normalizeHexColor(String(widget.bodyBackground));
    if (widget.background !== undefined) branding.widgetBodyBackground = normalizeHexColor(String(widget.background)); // legacy alias

    // Widget body gradient: two strict-hex endpoints composed into a CSS
    // gradient string for widgetBodyBackground. Each endpoint is normalized
    // (named colors / 3-digit hex) then gated to strict hex; if either endpoint
    // fails the check the pair is dropped so the current background is preserved
    // by the partial downstream merge.
    if (widget.bodyGradientStart !== undefined || widget.bodyGradientEnd !== undefined) {
      const bodyStart = isValidHex(normalizeHexColor(String(widget.bodyGradientStart)))
        ? normalizeHexColor(String(widget.bodyGradientStart))
        : null;
      const bodyEnd = isValidHex(normalizeHexColor(String(widget.bodyGradientEnd)))
        ? normalizeHexColor(String(widget.bodyGradientEnd))
        : null;
      if (bodyStart && bodyEnd) {
        branding.widgetBodyBackground = `linear-gradient(135deg, ${bodyStart}, ${bodyEnd})`;
      }
    }
  }

  // Map theme.* -> branding.*
  if (theme) {
    assignSolidHex(branding, 'primaryColor', theme.primary);
    assignSolidHex(branding, 'accentColor', theme.secondary);
    if (theme.logoUrl !== undefined) branding.logoUrl = theme.logoUrl;
    if (theme.opacity !== undefined) branding.widgetBodyOpacity = theme.opacity;

    // Map backgroundType + gradients -> headerConfig
    if (theme.backgroundType !== undefined || theme.primaryGradientStart !== undefined || theme.primaryGradientEnd !== undefined) {
      const headerConfig: Record<string, unknown> = {};
      if (theme.backgroundType !== undefined) headerConfig.type = theme.backgroundType;
      assignSolidHex(headerConfig, 'colorStart', theme.primaryGradientStart);
      assignSolidHex(headerConfig, 'colorEnd', theme.primaryGradientEnd);
      // When the voice intent is "header background to <color>" with a solid
      // type, theme.primary IS the intended header color (mirrors
      // migrateLegacyBranding's treatment of headerBackground).
      if (theme.primary !== undefined && theme.backgroundType === 'solid') {
        assignSolidHex(headerConfig, 'colorStart', theme.primary);
      }
      // A resolved two-stop pair without an explicit backgroundType renders as
      // a gradient — default the type so the Studio paints it correctly.
      if (headerConfig.colorStart && headerConfig.colorEnd && headerConfig.type !== 'solid' && headerConfig.type !== 'image') {
        headerConfig.type = 'gradient';
      }
      branding.headerConfig = headerConfig;
    }

    // Map secondary gradients -> footerConfig
    if (theme.secondaryGradientStart !== undefined || theme.secondaryGradientEnd !== undefined) {
      const footerConfig: Record<string, unknown> = {};
      assignSolidHex(footerConfig, 'colorStart', theme.secondaryGradientStart);
      assignSolidHex(footerConfig, 'colorEnd', theme.secondaryGradientEnd);
      if (footerConfig.colorStart && footerConfig.colorEnd) {
        footerConfig.type = 'gradient';
      }
      branding.footerConfig = footerConfig;
    }
  }

  const aiPersona: Record<string, unknown> = {};

  // Map behavior.prompt -> aiPersona.systemPrompt
  if (behavior) {
    if (behavior.prompt !== undefined) aiPersona.systemPrompt = behavior.prompt;
    if (behavior.tone !== undefined) {
      const mappedTemperature = mapToneToTemperature(behavior.tone);
      if (mappedTemperature !== undefined) aiPersona.temperature = mappedTemperature;
    }
  }

  // Map aiPersona.personaMode (emitted by the LLM for "switch to concierge/sales").
  // This is the field the StudioDraftProvider's persona toggle reads.
  if (aiPersonaRaw?.personaMode !== undefined) {
    aiPersona.personaMode = aiPersonaRaw.personaMode;
  }

  const features: Record<string, unknown> = {};

  // Map ui.* -> features
  if (ui) {
    if (ui.aiInsightBadge !== undefined) features.aiInsightBadge = ui.aiInsightBadge;
    if (ui.aiDesignMirror !== undefined) features.aiDesignMirror = ui.aiDesignMirror;
    if (ui.customCss !== undefined) features.customCss = ui.customCss;
    if (ui.customCssCode !== undefined) features.customCssCode = ui.customCssCode;
  }

  const studioConfig: Partial<CanonicalWidgetConfig> = {};

  if (Object.keys(branding).length > 0) {
    studioConfig.branding = branding as CanonicalWidgetConfig['branding'];
  }
  if (Object.keys(aiPersona).length > 0) {
    studioConfig.aiPersona = aiPersona as CanonicalWidgetConfig['aiPersona'];
  }
  if (Object.keys(features).length > 0) {
    studioConfig.features = features as CanonicalWidgetConfig['features'];
  }

  return { studioConfig };
}

function mapToneToTemperature(tone: unknown): number | undefined {
  if (typeof tone === 'number') return tone;
  if (typeof tone !== 'string') return undefined;
  const lower = tone.toLowerCase();
  if (lower.includes('precise') || lower.includes('formal') || lower.includes('deterministic')) return 0.2;
  if (lower.includes('balanced') || lower.includes('default') || lower.includes('moderate')) return 0.5;
  if (lower.includes('creative') || lower.includes('casual') || lower.includes('playful')) return 1.0;
  return undefined;
}