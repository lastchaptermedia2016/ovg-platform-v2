/**
 * Canonical Tenant Configuration Schema
 *
 * Single source of truth for all widget configuration across:
 * - Client Portal (BrandingStudio, AIPersonaSettings)
 * - Reseller Portal (ClientBrandingStudio)
 * - AI Voice Pipeline (SYSTEM_UPDATE_BRANDING)
 *
 * Migrates from dual schemas:
 * - tenants.widget_config.widget_studio (Client Portal path)
 * - tenants.widget_config.branding + features (Reseller Portal path)
 *
 * @module tenant-config.canonical
 */

import { z } from 'zod';

// ============================================================================
// Utility Schemas
// ============================================================================

/**
 * Hex color validation schema.
 * Accepts colors in the format #RRGGBB or #RRGGBBAA.
 */
export const CanonicalHexColorSchema = z
  .string()
  .regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{8})$/, {
    message: 'Must be a valid hex color in format #RRGGBB or #RRGGBBAA',
  });

/**
 * URL validation schema.
 * Accepts absolute URLs, relative paths, or null for clearing.
 */
export const CanonicalURLSchema = z
  .string()
  .url({ message: 'Must be a valid URL' })
  .nullable()
  .or(z.string().startsWith('/'))
  .nullable();

// ============================================================================
// Nested Component Schemas
// ============================================================================

/**
 * Background section configuration schema.
 * Nested structure for header and footer with full property support.
 */
export const CanonicalBackgroundSectionSchema = z.object({
  type: z.enum(['none', 'solid', 'gradient', 'image']).optional(),
  colorStart: CanonicalHexColorSchema.optional(),
  colorEnd: CanonicalHexColorSchema.optional(),
  opacity: z.number().min(0).max(1).optional(),
  image: CanonicalURLSchema.optional(),
});

export type CanonicalBackgroundSection = z.infer<typeof CanonicalBackgroundSectionSchema>;

/**
 * Layered branding configuration schema.
 * Describes a single visual layer (header, footer, or widget body) with an
 * optional background media, a real-time opacity, and an optional backdrop blur.
 *
 * @property type - Background kind: none | solid | gradient | image
 * @property value - Hex color (solid), CSS gradient string (gradient), or URL (image). null when type is none.
 * @property opacity - Layer opacity clamped to 0–1.0 (default 1.0).
 * @property backdropBlur - Apply a frosted-glass backdrop blur (primarily the widget body).
 */
export const LayerConfigSchema = z.object({
  type: z.enum(['none', 'solid', 'gradient', 'image']),
  value: z.string().nullable(),
  opacity: z.number().min(0).max(1.0).default(1.0),
  backdropBlur: z.boolean().default(false),
});

export type LayerConfig = z.infer<typeof LayerConfigSchema>;

/**
 * Widget body configuration schema.
 * Controls chat window transparency and background.
 */
export const CanonicalWidgetBodySchema = z.object({
  opacity: z.number().min(0).max(1).optional(),
  background: z.string().optional(), // hex, rgb, or rgba
});

export type CanonicalWidgetBody = z.infer<typeof CanonicalWidgetBodySchema>;

// ============================================================================
// AI Persona Schema
// ============================================================================

export const CanonicalActionCapabilitiesSchema = z.object({
  canExecute: z.boolean().optional(),
  canAccessAnalytics: z.boolean().optional(),
  canModifyConfig: z.boolean().optional(),
});

export type CanonicalActionCapabilities = z.infer<typeof CanonicalActionCapabilitiesSchema>;

export const CanonicalAIPersonaSchema = z.object({
  name: z.string().min(1).optional(),
  voiceId: z.string().min(1).optional(),
  personality: z.enum(['friendly', 'direct', 'professional', 'minimalist']).optional(),
  conversationStyle: z.union([
    z.string(),
    z.object({
      text: z.string().optional(),
      actionCapabilities: CanonicalActionCapabilitiesSchema.optional(),
    }),
  ]).optional(),
  actionCapabilities: CanonicalActionCapabilitiesSchema.optional(),
  systemPrompt: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  personaMode: z.enum(['sales', 'concierge']).optional(),
});

export type CanonicalAIPersona = z.infer<typeof CanonicalAIPersonaSchema>;

// ============================================================================
// Branding Schema (Canonical)
// ============================================================================

export const CanonicalBrandingSchema = z.object({
  // Core brand colors
  primaryColor: CanonicalHexColorSchema.optional(),
  accentColor: CanonicalHexColorSchema.optional(),
  brandName: z.string().optional(),
  logoUrl: z.string().url().or(z.string().startsWith('/')).or(z.literal('')).nullable().optional(),

  // Layered branding (header / footer / widget body) with transparency + media.
  header: LayerConfigSchema.optional(),
  footer: LayerConfigSchema.optional(),
  widgetBody: LayerConfigSchema.optional(),

  // Widget position
  widgetPosition: z.enum(['bottom-right', 'bottom-left', 'top-right', 'top-left']).optional(),

  // Header background configuration (nested, full support)
  headerConfig: CanonicalBackgroundSectionSchema.optional(),

  // Footer background configuration (nested, full support)
  footerConfig: CanonicalBackgroundSectionSchema.optional(),

  // Widget body customization
  widgetBodyOpacity: z.number().min(0).max(1).nullable().optional(),
  widgetBodyBackground: z.string().nullable().optional(),

  // Custom CSS support
  customCssCode: z.string().optional(),
});

export type CanonicalBranding = z.infer<typeof CanonicalBrandingSchema>;

// ============================================================================
// Features Schema
// ============================================================================

export const CanonicalFeaturesSchema = z.object({
  aiInsightBadge: z.boolean().optional(),
  aiDesignMirror: z.boolean().optional(),
  customCss: z.boolean().optional(),
  customCssCode: z.string().optional(),
  voiceFeaturesEnabled: z.boolean().optional(),
  localFallbackAlert: z.boolean().optional(),
});

export type CanonicalFeatures = z.infer<typeof CanonicalFeaturesSchema>;

// ============================================================================
// Theme Schema (for forward compatibility)
// ============================================================================

export const CanonicalThemeSchema = z.object({
  colors: z.record(CanonicalHexColorSchema).optional(),
  fonts: z.record(z.string()).optional(),
  spacing: z.record(z.number()).optional(),
  borderRadius: z.record(z.number()).optional(),
});

export type CanonicalTheme = z.infer<typeof CanonicalThemeSchema>;

// ============================================================================
// Integrations Schema
// ============================================================================

export const CanonicalWebhooksSchema = z
  .record(
    z.object({
      url: z.string().url(),
      events: z.array(z.string()).optional(),
      headers: z.record(z.string()).optional(),
    })
  )
  .optional();

export const CanonicalIntegrationsSchema = z.object({
  domains: z.array(z.string()).optional(),
  webhooks: CanonicalWebhooksSchema.optional(),
  endpoints: z.record(z.string()).optional(),
  booking: z.object({
    enabled: z.boolean().optional(),
    providerType: z.enum(['INTERNAL', 'EXTERNAL']).optional(),
    updatedAt: z.string().optional(),
  }).optional(),
});

export type CanonicalIntegrations = z.infer<typeof CanonicalIntegrationsSchema>;

// ============================================================================
// Suggested Actions Schema
// ============================================================================

/**
 * A single dynamic quick-action pill surfaced above the chat input when the
 * conversation is still empty. `message` actions forward `payload` to the chat
 * pipeline; `link` actions open `payload` in a new tab.
 */
export const SuggestedActionSchema = z.object({
  label: z.string().min(1),
  actionType: z.enum(['message', 'link']),
  payload: z.string().min(1),
});

export type SuggestedAction = z.infer<typeof SuggestedActionSchema>;

// ============================================================================
// AI Settings Schema
// ============================================================================

export const CanonicalAISettingsSchema = z.object({
  systemPrompt: z.string().optional(),
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().positive().optional(),
  // Persona fields (also accessible via aiPersona for backward compat)
  name: z.string().optional(),
  voiceId: z.string().optional(),
  personality: z.enum(['friendly', 'direct', 'professional', 'minimalist']).optional(),
  conversationStyle: z.union([
    z.string(),
    z.object({
      text: z.string().optional(),
      actionCapabilities: CanonicalActionCapabilitiesSchema.optional(),
    })
  ]).optional(),
});

export type CanonicalAISettings = z.infer<typeof CanonicalAISettingsSchema>;

// ============================================================================
// Main Canonical Widget Config Schema
// ============================================================================

/**
 * Canonical widget configuration schema.
 * This is the single source of truth for all configuration data stored in
 * tenants.widget_config JSON column.
 */
export const CanonicalWidgetConfigSchema = z.object({
  branding: CanonicalBrandingSchema.optional(),
  features: CanonicalFeaturesSchema.optional(),
  theme: CanonicalThemeSchema.optional(),
  integrations: CanonicalIntegrationsSchema.optional(),
  ai_settings: CanonicalAISettingsSchema.optional(),
  // Dynamic quick-action pills rendered above the chat input while the
  // conversation is empty. Parsed by the widget surface; see SuggestedActionSchema.
  suggestedActions: z.array(SuggestedActionSchema).optional(),
  // Widget opening greeting message, configurable from the Persona Settings page.
  greeting: z.string().optional(),
  // Legacy compatibility: aiPersona path (maps to ai_settings fields)
  aiPersona: CanonicalAIPersonaSchema.optional(),
  // Legacy compatibility: flat header/footer fields (deprecated, use nested)
  headerBackground: CanonicalHexColorSchema.optional(),
  headerBackgroundType: z.enum(['solid', 'gradient', 'image']).optional(),
  headerGradientStart: CanonicalHexColorSchema.optional(),
  headerGradientEnd: CanonicalHexColorSchema.optional(),
  headerImage: CanonicalURLSchema.optional(),
  headerOpacity: z.number().min(0).max(1).optional(),
  footerBackground: CanonicalHexColorSchema.optional(),
  footerBackgroundType: z.enum(['solid', 'gradient', 'image']).optional(),
  footerGradientStart: CanonicalHexColorSchema.optional(),
  footerGradientEnd: CanonicalHexColorSchema.optional(),
  footerImage: CanonicalURLSchema.optional(),
  footerOpacity: z.number().min(0).max(1).optional(),
}).passthrough();

export type CanonicalWidgetConfig = z.infer<typeof CanonicalWidgetConfigSchema>;

// ============================================================================
// Validation Utilities
// ============================================================================

/**
 * Parse and validate canonical widget configuration.
 * Throws ZodError if validation fails.
 */
export function validateCanonicalWidgetConfig(data: unknown): CanonicalWidgetConfig {
  return CanonicalWidgetConfigSchema.parse(data);
}

/**
 * Safely parse and validate canonical widget configuration.
 */
export function safeParseCanonicalWidgetConfig(
  data: unknown
): { success: true; data: CanonicalWidgetConfig } | { success: false; error: z.ZodError<CanonicalWidgetConfig> } {
  return CanonicalWidgetConfigSchema.safeParse(data) as { success: true; data: CanonicalWidgetConfig } | { success: false; error: z.ZodError<CanonicalWidgetConfig> };
}

/**
 * Migration helper: Convert legacy flat reseller branding to nested structure.
 * Transforms headerBackgroundType + headerGradientStart + headerGradientEnd
 * into a single headerConfig object.
 */
export function migrateLegacyBranding(legacy: Partial<CanonicalWidgetConfig>): CanonicalWidgetConfig {
  const branding: Partial<CanonicalBranding> = {};

  // Map legacy flat header fields to nested headerConfig
  if (legacy.headerBackground || legacy.headerBackgroundType || legacy.headerGradientStart || legacy.headerGradientEnd || legacy.headerImage || legacy.headerOpacity !== undefined) {
    branding.headerConfig = {};
    if (legacy.headerBackgroundType) {
      branding.headerConfig.type = legacy.headerBackgroundType === 'solid' ? 'solid' : legacy.headerBackgroundType === 'gradient' ? 'gradient' : 'image';
    }
    if (legacy.headerBackground) branding.headerConfig.colorStart = legacy.headerBackground;
    if (legacy.headerGradientStart) branding.headerConfig.colorStart = legacy.headerGradientStart;
    if (legacy.headerGradientEnd) branding.headerConfig.colorEnd = legacy.headerGradientEnd;
    if (legacy.headerImage) branding.headerConfig.image = legacy.headerImage;
    if (legacy.headerOpacity !== undefined) branding.headerConfig.opacity = legacy.headerOpacity;
  }

  // Map legacy flat footer fields to nested footerConfig
  if (legacy.footerBackground || legacy.footerBackgroundType || legacy.footerGradientStart || legacy.footerGradientEnd || legacy.footerImage || legacy.footerOpacity !== undefined) {
    branding.footerConfig = {};
    if (legacy.footerBackgroundType) {
      branding.footerConfig.type = legacy.footerBackgroundType === 'solid' ? 'solid' : legacy.footerBackgroundType === 'gradient' ? 'gradient' : 'image';
    }
    if (legacy.footerBackground) branding.footerConfig.colorStart = legacy.footerBackground;
    if (legacy.footerGradientStart) branding.footerConfig.colorStart = legacy.footerGradientStart;
    if (legacy.footerGradientEnd) branding.footerConfig.colorEnd = legacy.footerGradientEnd;
    if (legacy.footerImage) branding.footerConfig.image = legacy.footerImage;
    if (legacy.footerOpacity !== undefined) branding.footerConfig.opacity = legacy.footerOpacity;
  }

  // Map legacy primaryColor to accentColor if only accent exists
  if (legacy.headerBackground) branding.primaryColor = legacy.headerBackground;
  if (legacy.footerBackground) branding.accentColor = legacy.footerBackground;
  if (legacy.logoUrl) branding.logoUrl = legacy.logoUrl as CanonicalBranding['logoUrl'];

  // Map customCssCode
  if (legacy.customCssCode) branding.customCssCode = legacy.customCssCode as CanonicalBranding['customCssCode'];

  return {
    ...legacy,
    branding: { ...legacy.branding, ...branding } as CanonicalBranding,
  };
}