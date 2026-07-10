import type { CanonicalWidgetConfig } from '@/lib/schemas/tenant-config.canonical';
import { normalizeHexColor } from '@/lib/colors';

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
    if (widget.bodyBackground !== undefined) branding.widgetBodyBackground = normalizeHexColor(String(widget.bodyBackground));
    if (widget.background !== undefined) branding.widgetBodyBackground = normalizeHexColor(String(widget.background)); // legacy alias
  }

  // Map theme.* -> branding.*
  if (theme) {
    if (theme.primary !== undefined) branding.primaryColor = normalizeHexColor(String(theme.primary));
    if (theme.secondary !== undefined) branding.accentColor = normalizeHexColor(String(theme.secondary));
    if (theme.logoUrl !== undefined) branding.logoUrl = theme.logoUrl;
    if (theme.opacity !== undefined) branding.widgetBodyOpacity = theme.opacity;

    // Map backgroundType + gradients -> headerConfig
    if (theme.backgroundType !== undefined || theme.primaryGradientStart !== undefined || theme.primaryGradientEnd !== undefined) {
      const headerConfig: Record<string, unknown> = {};
      if (theme.backgroundType !== undefined) headerConfig.type = theme.backgroundType;
      if (theme.primaryGradientStart !== undefined) headerConfig.colorStart = normalizeHexColor(String(theme.primaryGradientStart));
      if (theme.primaryGradientEnd !== undefined) headerConfig.colorEnd = normalizeHexColor(String(theme.primaryGradientEnd));
      // When the voice intent is "header background to <color>" with a solid
      // type, theme.primary IS the intended header color (mirrors
      // migrateLegacyBranding's treatment of headerBackground).
      if (theme.primary !== undefined && theme.backgroundType === 'solid') {
        headerConfig.colorStart = normalizeHexColor(String(theme.primary));
      }
      branding.headerConfig = headerConfig;
    }

    // Map secondary gradients -> footerConfig
    if (theme.secondaryGradientStart !== undefined || theme.secondaryGradientEnd !== undefined) {
      const footerConfig: Record<string, unknown> = {};
      if (theme.secondaryGradientStart !== undefined) footerConfig.colorStart = normalizeHexColor(String(theme.secondaryGradientStart));
      if (theme.secondaryGradientEnd !== undefined) footerConfig.colorEnd = normalizeHexColor(String(theme.secondaryGradientEnd));
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