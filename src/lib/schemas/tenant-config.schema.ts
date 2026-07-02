import { z } from 'zod';

/**
 * Tenant Configuration Schema Collection
 * 
 * Provides comprehensive Zod schemas for validating tenant configuration data stored in JSONB columns.
 * These schemas enforce type safety while allowing flexibility for unknown properties and extensions.
 * 
 * @module tenant-config.schema
 */

// ============================================================================
// Utility Schemas
// ============================================================================

/**
 * Hex color validation schema.
 * Accepts colors in the format #RRGGBB or #RRGGBBAA.
 * 
 * @example "#FF5733", "#FF5733AA"
 */
export const HexColorSchema = z
  .string()
  .regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{8})$/, {
    message: 'Must be a valid hex color in format #RRGGBB or #RRGGBBAA',
  });

/**
 * URL validation schema.
 * Accepts absolute and relative URLs, but rejects invalid URL strings.
 * 
 * @example "https://example.com", "https://cdn.example.com/logo.png", "/images/logo.png"
 */
export const URLSchema = z
  .string()
  .url({ message: 'Must be a valid URL' })
  .or(z.string().startsWith('/'));

// ============================================================================
// Branding Schema
// ============================================================================

/**
 * Branding configuration schema.
 * Defines visual identity elements for the widget.
 * 
 * @property primaryColor - Primary brand color (hex format)
 * @property accentColor - Accent color for highlights (hex format)
 * @property logoUrl - URL to the brand logo image
 * @property widgetBodyOpacity - Opacity of the widget body (0-1 range)
 * @property widgetBodyBackground - CSS background value for widget body
 * 
 * @example
 * {
 *   primaryColor: "#1A73E8",
 *   accentColor: "#34A853",
 *   logoUrl: "https://cdn.example.com/logo.png",
 *   widgetBodyOpacity: 0.95,
 *   widgetBodyBackground: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)"
 * }
 */
export const BackgroundSettingsSchema = z.object({
  type: z.enum(['solid', 'gradient']).optional(),
  colorStart: HexColorSchema.optional(),
  colorEnd: HexColorSchema.optional(),
  image: URLSchema.nullable().optional(),
}).passthrough();

export type BackgroundSettings = z.infer<typeof BackgroundSettingsSchema>;

export const BrandingSchema = z.object({
  primaryColor: HexColorSchema.optional(),
  accentColor: HexColorSchema.optional(),
  logoUrl: URLSchema.nullable().optional(),
  widgetBodyOpacity: z
    .number()
    .min(0)
    .max(1)
    .optional(),
  widgetBodyBackground: z.string().optional(),
  headerConfig: BackgroundSettingsSchema.optional(),
  footerConfig: BackgroundSettingsSchema.optional(),
}).passthrough();

export type Branding = z.infer<typeof BrandingSchema>;

// ============================================================================
// Theme Schema
// ============================================================================

/**
 * Color palette configuration within theme.
 * Allows flexible color properties while validating hex format.
 * 
 * @example
 * {
 *   primary: "#1A73E8",
 *   secondary: "#34A853",
 *   error: "#D33B27",
 *   warning: "#F8AB00"
 * }
 */
export const ThemeColorsSchema = z
  .record(HexColorSchema)
  .optional();

/**
 * Typography/Font configuration within theme.
 * Allows flexible font properties.
 * 
 * @example
 * {
 *   heading: "Inter, sans-serif",
 *   body: "Roboto, sans-serif",
 *   mono: "Courier New, monospace"
 * }
 */
export const ThemeFontsSchema = z
  .record(z.string())
  .optional();

/**
 * Theme configuration schema.
 * Defines visual design tokens for the widget.
 * 
 * @property colors - Color palette
 * @property fonts - Typography settings
 * @property spacing - Spacing scale (e.g., { xs: 4, sm: 8, md: 16 })
 * @property borderRadius - Border radius scale
 * 
 * @example
 * {
 *   colors: { primary: "#1A73E8", secondary: "#34A853" },
 *   fonts: { heading: "Inter", body: "Roboto" },
 *   spacing: { xs: 4, sm: 8, md: 16 },
 *   borderRadius: { sm: 4, md: 8, lg: 12 }
 * }
 */
export const ThemeSchema = z.object({
  colors: ThemeColorsSchema,
  fonts: ThemeFontsSchema,
  spacing: z.record(z.number()).optional(),
  borderRadius: z.record(z.number()).optional(),
}).passthrough();

export type Theme = z.infer<typeof ThemeSchema>;

// ============================================================================
// Integrations Schema
// ============================================================================

/**
 * Webhooks configuration for integrations.
 * Maps event types to webhook endpoints with optional authentication.
 * 
 * @example
 * {
 *   "message.sent": {
 *     url: "https://webhook.example.com/events",
 *     events: ["message.sent", "message.failed"]
 *   }
 * }
 */
export const WebhooksSchema = z
  .record(z.object({
    url: URLSchema,
    events: z.array(z.string()).optional(),
    headers: z.record(z.string()).optional(),
  }).passthrough())
  .optional();

/**
 * Integrations configuration schema.
 * Manages third-party service connections and domain whitelist.
 * 
 * @property domains - Array of allowed domains (replaces, not merges with existing)
 * @property webhooks - Webhook endpoint configurations
 * @property endpoints - Flexible integration endpoint mappings
 * 
 * @example
 * {
 *   domains: ["example.com", "www.example.com"],
 *   webhooks: {
 *     "message.sent": {
 *       url: "https://webhook.example.com/events",
 *       events: ["message.sent"]
 *     }
 *   },
 *   endpoints: {
 *     analytics: "https://analytics.example.com/api",
 *     crm: "https://crm.example.com/api"
 *   }
 * }
 */
export const IntegrationsSchema = z.object({
  domains: z.array(z.string()).optional(),
  webhooks: WebhooksSchema,
  endpoints: z.record(z.string()).optional(),
}).passthrough();

export type Integrations = z.infer<typeof IntegrationsSchema>;

// ============================================================================
// Features Schema
// ============================================================================

/**
 * Features configuration schema.
 * Manages feature flags and capability toggles.
 * 
 * @property aiInsightBadge - Enable AI insight indicators
 * @property aiDesignMirror - Enable AI-driven design suggestions
 * @property customCss - Enable custom CSS support
 * 
 * @example
 * {
 *   aiInsightBadge: true,
 *   aiDesignMirror: false,
 *   customCss: true
 * }
 */
export const FeaturesSchema = z.object({
  aiInsightBadge: z.boolean().optional(),
  aiDesignMirror: z.boolean().optional(),
  customCss: z.boolean().optional(),
}).passthrough();

export type Features = z.infer<typeof FeaturesSchema>;

// ============================================================================
// AI Settings Schema
// ============================================================================

/**
 * AI settings configuration schema.
 * Manages AI model behavior and parameters.
 * 
 * @property systemPrompt - System prompt for AI model
 * @property model - Model identifier (e.g., "gpt-4", "claude-3-sonnet")
 * @property temperature - Sampling temperature (0-2 range)
 * @property maxTokens - Maximum tokens for response
 * 
 * @example
 * {
 *   systemPrompt: "You are a helpful customer service AI.",
 *   model: "gpt-4",
 *   temperature: 0.7,
 *   maxTokens: 512
 * }
 */
export const ActionCapabilitiesSchema = z.object({
  canExecute: z.boolean().optional(),
  canAccessAnalytics: z.boolean().optional(),
  canModifyConfig: z.boolean().optional(),
}).passthrough();

export type ActionCapabilities = z.infer<typeof ActionCapabilitiesSchema>;

export const AISettingsSchema = z.object({
  systemPrompt: z.string().optional(),
  model: z.string().optional(),
  temperature: z
    .number()
    .min(0)
    .max(2)
    .optional(),
  maxTokens: z.number().positive().optional(),
  // AI Persona fields
  name: z.string().optional(),
  voiceId: z.string().optional(),
  personality: z.enum(['friendly', 'direct', 'professional']).optional(),
  conversationStyle: z.union([
    z.string(),
    z.object({
      text: z.string().optional(),
      actionCapabilities: ActionCapabilitiesSchema.optional(),
    }).passthrough(),
  ]).optional(),
}).passthrough();

export type AISettings = z.infer<typeof AISettingsSchema>;

// ============================================================================
// Main Widget Config Schema
// ============================================================================

/**
 * Complete widget configuration schema.
 * Combines all configuration aspects for tenant-level widget customization.
 * 
 * Uses `.passthrough()` to allow unknown properties and extensions
 * for future compatibility.
 * 
 * @property branding - Visual branding configuration
 * @property theme - Design theme settings
 * @property integrations - Third-party integrations
 * @property features - Feature flags and toggles
 * @property ai_settings - AI model configuration
 * 
 * @example
 * {
 *   branding: {
 *     primaryColor: "#1A73E8",
 *     logoUrl: "https://cdn.example.com/logo.png"
 *   },
 *   theme: {
 *     colors: { primary: "#1A73E8" },
 *     fonts: { heading: "Inter" }
 *   },
 *   integrations: {
 *     domains: ["example.com"]
 *   },
 *   features: {
 *     aiInsightBadge: true
 *   },
 *   ai_settings: {
 *     temperature: 0.7
 *   }
 * }
 */
export const WidgetConfigSchema = z.object({
  branding: BrandingSchema.optional(),
  theme: ThemeSchema.optional(),
  integrations: IntegrationsSchema.optional(),
  features: FeaturesSchema.optional(),
  ai_settings: AISettingsSchema.optional(),
}).passthrough();

export type WidgetConfig = z.infer<typeof WidgetConfigSchema>;

// ============================================================================
// Custom Assets Schema
// ============================================================================

/**
 * Custom assets configuration schema.
 * Manages URLs to custom assets like headers, footers, and media.
 * 
 * @property header_url - URL to custom header asset
 * @property footer_url - URL to custom footer asset
 * @property favicon_url - URL to custom favicon
 * @property custom_css_url - URL to custom CSS file
 * 
 * @example
 * {
 *   header_url: "https://cdn.example.com/header.jpg",
 *   footer_url: "https://cdn.example.com/footer.jpg",
 *   favicon_url: "https://cdn.example.com/favicon.ico"
 * }
 */
export const CustomAssetsSchema = z.object({
  header_url: URLSchema.nullable().optional(),
  footer_url: URLSchema.nullable().optional(),
  favicon_url: URLSchema.nullable().optional(),
  custom_css_url: URLSchema.nullable().optional(),
}).passthrough();

export type CustomAssets = z.infer<typeof CustomAssetsSchema>;

// ============================================================================
// Validation Utilities
// ============================================================================

/**
 * Parse and validate widget configuration data.
 * Throws ZodError if validation fails.
 * 
 * @param data - Unknown configuration data to validate
 * @returns Validated and typed WidgetConfig object
 * @throws {ZodError} If validation fails
 * 
 * @example
 * ```typescript
 * try {
 *   const config = validateWidgetConfig(unknownData);
 *   console.log(config.branding?.primaryColor);
 * } catch (error) {
 *   console.error('Invalid config:', error.errors);
 * }
 * ```
 */
export function validateWidgetConfig(data: unknown): WidgetConfig {
  return WidgetConfigSchema.parse(data);
}

/**
 * Safely parse and validate widget configuration data.
 * Returns a result object instead of throwing.
 * 
 * @param data - Unknown configuration data to validate
 * @returns Result object with either data or error details
 * 
 * @example
 * ```typescript
 * const result = safeParse WidgetConfig(unknownData);
 * if (result.success) {
 *   console.log(result.data.branding?.primaryColor);
 * } else {
 *   console.error('Validation errors:', result.error.errors);
 * }
 * ```
 */
export function safeParseWidgetConfig(
  data: unknown
): { success: true; data: WidgetConfig } | { success: false; error: z.ZodError<WidgetConfig> } {
  const result = WidgetConfigSchema.safeParse(data);
  return result;
}

/**
 * Parse and validate custom assets configuration data.
 * Throws ZodError if validation fails.
 * 
 * @param data - Unknown assets data to validate
 * @returns Validated and typed CustomAssets object
 * @throws {ZodError} If validation fails
 * 
 * @example
 * ```typescript
 * const assets = validateCustomAssets({ header_url: "https://..." });
 * console.log(assets.header_url);
 * ```
 */
export function validateCustomAssets(data: unknown): CustomAssets {
  return CustomAssetsSchema.parse(data);
}

/**
 * Safely parse and validate custom assets configuration data.
 * Returns a result object instead of throwing.
 * 
 * @param data - Unknown assets data to validate
 * @returns Result object with either data or error details
 * 
 * @example
 * ```typescript
 * const result = safeParseCustomAssets(unknownData);
 * if (result.success) {
 *   console.log(result.data);
 * } else {
 *   console.error('Validation errors:', result.error.errors);
 * }
 * ```
 */
export function safeParseCustomAssets(
  data: unknown
): { success: true; data: CustomAssets } | { success: false; error: z.ZodError<CustomAssets> } {
  const result = CustomAssetsSchema.safeParse(data);
  return result;
}

/**
 * Extract a nested value from widget config with type safety.
 * Returns undefined if the path doesn't exist or the value is not of the expected type.
 * 
 * @param config - Widget configuration object
 * @param schema - Zod schema to validate the extracted value
 * @param path - Dot-separated path (e.g., "branding.primaryColor")
 * @returns Validated value or undefined
 * 
 * @example
 * ```typescript
 * const primaryColor = extractConfigValue(
 *   config,
 *   HexColorSchema,
 *   'branding.primaryColor'
 * );
 * ```
 */
export function extractConfigValue<T>(
  config: WidgetConfig,
  schema: z.ZodSchema<T>,
  path: string
): T | undefined {
  const segments = path.split('.');
  let current: unknown = config;

  for (const segment of segments) {
    if (typeof current === 'object' && current !== null && segment in current) {
      current = (current as Record<string, unknown>)[segment];
    } else {
      return undefined;
    }
  }

  const result = schema.safeParse(current);
  return result.success ? result.data : undefined;
}

/**
 * Merge two widget configurations with proper deep merging for nested objects.
 * Arrays and primitive values in source completely replace target values.
 * 
 * @param target - Base configuration
 * @param source - Configuration to merge in
 * @returns Merged configuration
 * 
 * @example
 * ```typescript
 * const merged = mergeWidgetConfigs(baseConfig, overrideConfig);
 * ```
 */
export function mergeWidgetConfigs(
  target: WidgetConfig,
  source: Partial<WidgetConfig>
): WidgetConfig {
  const result: Record<string, unknown> = { ...target };

  for (const [key, sourceValue] of Object.entries(source)) {
    if (sourceValue === null || sourceValue === undefined) {
      result[key] = sourceValue;
      continue;
    }

    const targetValue = result[key];

    // Deep merge for objects (but not arrays or null)
    if (
      typeof sourceValue === 'object' &&
      !Array.isArray(sourceValue) &&
      typeof targetValue === 'object' &&
      !Array.isArray(targetValue) &&
      targetValue !== null
    ) {
      result[key] = mergeWidgetConfigs(
        targetValue as WidgetConfig,
        sourceValue as Partial<WidgetConfig>
      );
    } else {
      // Replace for primitives, arrays, and non-object values
      result[key] = sourceValue;
    }
  }

  return validateWidgetConfig(result);
}
