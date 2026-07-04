import type { ClientWidgetStudio } from '@/lib/schemas/client-config.schema';

/**
 * Result of translating a voice payload into a ClientWidgetStudio shape.
 */
export interface VoiceTranslationResult {
  /** The partial studio config with fields mapped to their schema homes. */
  studioConfig: Partial<ClientWidgetStudio>;
  /** Fields that had no persistence path in the schema, logged for awareness. */
  unmapped: Record<string, unknown>;
}

/**
 * Translate a SYSTEM_UPDATE_BRANDING voice payload (theme/ui/behavior shape)
 * into a partial ClientWidgetStudioSchema-shaped object.
 *
 * Only includes fields that exist in the input — no defaults are invented
 * for missing fields.
 *
 * KNOWN GAPS (not bugs):
 * - ui.* (aiInsightBadge, aiDesignMirror, customCss, etc.) currently have
 *   no persistence path. They are returned in `unmapped` for awareness.
 * - behavior.* (prompt, tone) map to aiPersona but the translate is a
 *   no-op today since there's no voice-driven persona change flow.
 *
 * @param voicePayload - The raw payload from the LLM (theme/ui/behavior shape).
 * @returns The translated partial studio config and any unmapped fields.
 */
export function translateVoicePayloadToStudioConfig(
  voicePayload: Record<string, unknown>
): VoiceTranslationResult {
  const theme = voicePayload.theme as Record<string, unknown> | undefined;
  const ui = voicePayload.ui as Record<string, unknown> | undefined;
  const behavior = voicePayload.behavior as Record<string, unknown> | undefined;

  const branding: Record<string, unknown> = {};

  // Map theme.* -> branding.*
  if (theme) {
    if (theme.primary !== undefined) branding.primaryColor = theme.primary;
    if (theme.secondary !== undefined) branding.accentColor = theme.secondary;
    if (theme.logoUrl !== undefined) branding.logoUrl = theme.logoUrl;
    if (theme.opacity !== undefined) branding.widgetBodyOpacity = theme.opacity;

    // Map backgroundType + gradients -> headerConfig
    if (theme.backgroundType !== undefined || theme.primaryGradientStart !== undefined || theme.primaryGradientEnd !== undefined) {
      const headerConfig: Record<string, unknown> = {};
      if (theme.backgroundType !== undefined) headerConfig.type = theme.backgroundType;
      if (theme.primaryGradientStart !== undefined) headerConfig.colorStart = theme.primaryGradientStart;
      if (theme.primaryGradientEnd !== undefined) headerConfig.colorEnd = theme.primaryGradientEnd;
      branding.headerConfig = headerConfig;
    }

    // Map secondary gradients -> footerConfig
    if (theme.secondaryGradientStart !== undefined || theme.secondaryGradientEnd !== undefined) {
      const footerConfig: Record<string, unknown> = {};
      if (theme.secondaryGradientStart !== undefined) footerConfig.colorStart = theme.secondaryGradientStart;
      if (theme.secondaryGradientEnd !== undefined) footerConfig.colorEnd = theme.secondaryGradientEnd;
      branding.footerConfig = footerConfig;
    }
  }

  const studioConfig: Partial<ClientWidgetStudio> = {};
  if (Object.keys(branding).length > 0) {
    studioConfig.branding = branding as ClientWidgetStudio['branding'];
  }

  const unmapped: Record<string, unknown> = {};
  if (ui) unmapped.ui = ui;
  if (behavior) unmapped.behavior = behavior;

  return { studioConfig, unmapped };
}