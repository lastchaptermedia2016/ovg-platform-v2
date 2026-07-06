/**
 * Tenant Configuration Migration — Transformation Logic
 *
 * Pure functions that map legacy flat-field widget configurations into the
 * canonical nested structure defined by CanonicalWidgetConfigSchema.
 *
 * This module is intentionally DB-free so it can be unit-tested without
 * environment variables (see test-transformation.ts).
 */

import {
  safeParseCanonicalWidgetConfig,
  validateCanonicalWidgetConfig,
  type CanonicalWidgetConfig,
} from '../schemas/tenant-config.canonical';
import { deepMerge } from '../utils/deep-merge';

// ──────────────────────────────────────────────────────────────────────────────
// Flat → Nested Mapping Logic
// ──────────────────────────────────────────────────────────────────────────────

const LEGACY_FLAT_FIELDS = [
  'headerBackground',
  'headerBackgroundType',
  'headerGradientStart',
  'headerGradientEnd',
  'headerImage',
  'headerOpacity',
  'footerBackground',
  'footerBackgroundType',
  'footerGradientStart',
  'footerGradientEnd',
  'footerImage',
  'footerOpacity',
  'aiInsightBadge',
  'aiDesignMirror',
  'customCss',
] as const;

function buildHeaderConfig(legacy: Record<string, unknown>): Record<string, unknown> {
  const headerConfig: Record<string, unknown> = {};

  if (legacy.headerBackgroundType) {
    headerConfig.type = legacy.headerBackgroundType;
  }
  if (legacy.headerGradientStart) {
    headerConfig.colorStart = legacy.headerGradientStart;
  } else if (legacy.headerBackground) {
    headerConfig.colorStart = legacy.headerBackground;
  }
  if (legacy.headerGradientEnd) headerConfig.colorEnd = legacy.headerGradientEnd;
  if (legacy.headerImage) headerConfig.image = legacy.headerImage;
  if (legacy.headerOpacity !== undefined) headerConfig.opacity = legacy.headerOpacity;

  return headerConfig;
}

function buildFooterConfig(legacy: Record<string, unknown>): Record<string, unknown> {
  const footerConfig: Record<string, unknown> = {};

  if (legacy.footerBackgroundType) {
    footerConfig.type = legacy.footerBackgroundType;
  }
  if (legacy.footerGradientStart) {
    footerConfig.colorStart = legacy.footerGradientStart;
  } else if (legacy.footerBackground) {
    footerConfig.colorStart = legacy.footerBackground;
  }
  if (legacy.footerGradientEnd) footerConfig.colorEnd = legacy.footerGradientEnd;
  if (legacy.footerImage) footerConfig.image = legacy.footerImage;
  if (legacy.footerOpacity !== undefined) footerConfig.opacity = legacy.footerOpacity;

  return footerConfig;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Translate a legacy flat-field widget config into the canonical nested shape.
 * Preserves existing nested structures (via deepMerge) and keeps legacy flat
 * fields intact (zero data loss). Returns a CanonicalWidgetConfig.
 */
export function migrateLegacyConfig(raw: unknown): CanonicalWidgetConfig {
  const legacy = (raw as Record<string, unknown>) || {};
  const migrated: Record<string, unknown> = { ...legacy };

  const headerConfig = buildHeaderConfig(legacy);
  const footerConfig = buildFooterConfig(legacy);

  const brandingAdditions: Record<string, unknown> = {};

  if (Object.keys(headerConfig).length > 0) {
    const existingHeader = isPlainObject(legacy.branding)
      ? (legacy.branding as Record<string, unknown>).headerConfig as Record<string, unknown> | undefined
      : undefined;
    brandingAdditions.headerConfig = deepMerge(
      existingHeader ? { ...existingHeader } : {},
      headerConfig
    );
  }

  if (Object.keys(footerConfig).length > 0) {
    const existingFooter = isPlainObject(legacy.branding)
      ? (legacy.branding as Record<string, unknown>).footerConfig as Record<string, unknown> | undefined
      : undefined;
    brandingAdditions.footerConfig = deepMerge(
      existingFooter ? { ...existingFooter } : {},
      footerConfig
    );
  }

  if (legacy.headerBackground) brandingAdditions.primaryColor = legacy.headerBackground;
  if (legacy.footerBackground) brandingAdditions.accentColor = legacy.footerBackground;
  if (legacy.logoUrl) brandingAdditions.logoUrl = legacy.logoUrl;
  if (legacy.customCssCode) brandingAdditions.customCssCode = legacy.customCssCode;

  if (Object.keys(brandingAdditions).length > 0) {
    const existingBranding = isPlainObject(legacy.branding)
      ? { ...(legacy.branding as Record<string, unknown>) }
      : {};
    migrated.branding = deepMerge(existingBranding, brandingAdditions);
  }

  const featureFlags: Record<string, unknown> = {};
  if (typeof legacy.aiInsightBadge === 'boolean') featureFlags.aiInsightBadge = legacy.aiInsightBadge;
  if (typeof legacy.aiDesignMirror === 'boolean') featureFlags.aiDesignMirror = legacy.aiDesignMirror;
  if (typeof legacy.customCss === 'boolean') featureFlags.customCss = legacy.customCss;

  if (Object.keys(featureFlags).length > 0) {
    const existingFeatures = isPlainObject(legacy.features)
      ? { ...(legacy.features as Record<string, unknown>) }
      : {};
    migrated.features = deepMerge(existingFeatures, featureFlags);
  }

  const aiSettings: Record<string, unknown> = {};
  if (legacy.systemPrompt) aiSettings.systemPrompt = legacy.systemPrompt;
  if (legacy.model) aiSettings.model = legacy.model;
  if (typeof legacy.temperature === 'number') aiSettings.temperature = legacy.temperature;
  if (typeof legacy.maxTokens === 'number') aiSettings.maxTokens = legacy.maxTokens;
  if (legacy.name) aiSettings.name = legacy.name;
  if (legacy.voiceId) aiSettings.voiceId = legacy.voiceId;
  if (legacy.personality) aiSettings.personality = legacy.personality;
  if (legacy.conversationStyle) aiSettings.conversationStyle = legacy.conversationStyle;

  if (Object.keys(aiSettings).length > 0) {
    const existingAiSettings = isPlainObject(legacy.ai_settings)
      ? { ...(legacy.ai_settings as Record<string, unknown>) }
      : {};
    migrated.ai_settings = deepMerge(existingAiSettings, aiSettings);
  }

  return migrated as CanonicalWidgetConfig;
}

export { LEGACY_FLAT_FIELDS };

export function hasLegacyFlatFields(obj: Record<string, unknown>): boolean {
  return LEGACY_FLAT_FIELDS.some((field) => field in obj);
}

export function hasMissingNestedStructures(obj: Record<string, unknown>): boolean {
  const branding = obj.branding as Record<string, unknown> | undefined;
  const features = obj.features as Record<string, unknown> | undefined;
  const aiSettings = obj.ai_settings as Record<string, unknown> | undefined;

  const needsHeader =
    Boolean(obj.headerBackground || obj.headerBackgroundType) && !branding?.headerConfig;
  const needsFooter =
    Boolean(obj.footerBackground || obj.footerBackgroundType) && !branding?.footerConfig;
  const needsFeatures =
    (obj.aiInsightBadge !== undefined || obj.aiDesignMirror !== undefined) && !features?.aiInsightBadge;
  const needsAiSettings =
    Boolean(obj.systemPrompt || obj.model || obj.temperature !== undefined) &&
    !aiSettings?.systemPrompt;

  return Boolean(needsHeader || needsFooter || needsFeatures || needsAiSettings);
}

export function buildDiffSummary(legacy: Record<string, unknown>, migrated: CanonicalWidgetConfig): string[] {
  const diffs: string[] = [];
  const migratedRecord = migrated as Record<string, unknown>;
  const legacyBranding = isPlainObject(legacy.branding) ? (legacy.branding as Record<string, unknown>) : null;
  const legacyFeatures = isPlainObject(legacy.features) ? (legacy.features as Record<string, unknown>) : null;
  const legacyAiSettings = isPlainObject(legacy.ai_settings) ? (legacy.ai_settings as Record<string, unknown>) : null;
  const branding = isPlainObject(migratedRecord.branding) ? (migratedRecord.branding as Record<string, unknown>) : {};
  const features = isPlainObject(migratedRecord.features) ? (migratedRecord.features as Record<string, unknown>) : {};
  const aiSettings = isPlainObject(migratedRecord.ai_settings) ? (migratedRecord.ai_settings as Record<string, unknown>) : {};

  if (branding.headerConfig && !legacyBranding?.headerConfig) {
    diffs.push('+ branding.headerConfig');
  }
  if (branding.footerConfig && !legacyBranding?.footerConfig) {
    diffs.push('+ branding.footerConfig');
  }
  if (branding.primaryColor && !legacyBranding?.primaryColor) diffs.push(`+ branding.primaryColor = "${branding.primaryColor}"`);
  if (branding.accentColor && !legacyBranding?.accentColor) diffs.push(`+ branding.accentColor = "${branding.accentColor}"`);
  if (branding.logoUrl && !legacyBranding?.logoUrl) diffs.push(`+ branding.logoUrl = "${branding.logoUrl}"`);
  if (branding.customCssCode && !legacyBranding?.customCssCode) diffs.push('+ branding.customCssCode');

  if (features.aiInsightBadge !== undefined && !(legacyFeatures?.aiInsightBadge !== undefined)) {
    diffs.push(`+ features.aiInsightBadge = ${features.aiInsightBadge}`);
  }
  if (features.aiDesignMirror !== undefined && !(legacyFeatures?.aiDesignMirror !== undefined)) {
    diffs.push(`+ features.aiDesignMirror = ${features.aiDesignMirror}`);
  }
  if (features.customCss !== undefined && !(legacyFeatures?.customCss !== undefined)) {
    diffs.push(`+ features.customCss = ${features.customCss}`);
  }

  if (aiSettings.systemPrompt && !legacyAiSettings?.systemPrompt) diffs.push('+ ai_settings.systemPrompt');
  if (aiSettings.temperature !== undefined && !(legacyAiSettings?.temperature !== undefined)) {
    diffs.push(`+ ai_settings.temperature = ${aiSettings.temperature}`);
  }

  return diffs;
}

// Re-export validators for convenience in callers/tests
export { safeParseCanonicalWidgetConfig, validateCanonicalWidgetConfig };
