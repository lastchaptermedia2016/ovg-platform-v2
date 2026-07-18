import { z } from 'zod';

/**
 * Client Configuration Schema Collection
 * 
 * Provides comprehensive Zod schemas for client-side widget studio configuration.
 * This schema is INDEPENDENT and does NOT import from tenant-config.schema.ts
 * to ensure complete isolation between client and reseller portals.
 * 
 * @module client-config.schema
 */

// ============================================================================
// Utility Schemas (replicated for independence)
// ============================================================================

/**
 * Hex color validation schema.
 * Accepts colors in the format #RRGGBB or #RRGGBBAA.
 */
export const ClientHexColorSchema = z
  .string()
  .regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{8})$/, {
    message: 'Must be a valid hex color in format #RRGGBB or #RRGGBBAA',
  });

/**
 * URL validation schema.
 * Accepts absolute and relative URLs.
 */
export const ClientURLSchema = z
  .string()
  .url({ message: 'Must be a valid URL' })
  .or(z.string().startsWith('/'));

// ============================================================================
// AI Persona Schema (Client Edition)
// ============================================================================

/**
 * AI Persona configuration for client widget studio.
 * Defines the personality and interaction style of the AI assistant.
 * 
 * @property name - Display name for the AI persona
 * @property voiceId - Identifier for voice synthesis
 * @property personality - Predefined personality archetype
 * @property conversationStyle - Custom instructions for conversation tone/style
 */
// name/voiceId are optional. We accept an empty string as an "unset" state
// (toCanonicalAIPersona may emit voiceId: '') rather than failing validation,
// so persona-only saves from the voice bridge and the manual Save button both
// succeed without requiring a voice selection. The server treats '' as unset.
export const ClientAIPersonaSchema = z.object({
  name: z.string().optional(),
  voiceId: z.string().optional(),
  personality: z.enum(['professional', 'friendly', 'minimalist', 'direct']).optional(),
  conversationStyle: z.string().optional(),
  personaMode: z.enum(['sales', 'concierge']).optional(),
}).passthrough();

export type ClientAIPersona = z.infer<typeof ClientAIPersonaSchema>;

// ============================================================================
// Client Branding Schema
// ============================================================================

/**
 * Client branding configuration schema.
 * Defines visual identity elements for the widget with studio customizations.
 * 
 * @property primaryColor - Primary brand color (hex format)
 * @property accentColor - Accent color for highlights
 * @property logoUrl - URL to the brand logo
 * @property customButtonStyles - CSS button style overrides
 * @property widgetBodyOpacity - Opacity of widget body (0-1 range)
 * @property widgetBodyBackground - CSS background for widget body
 */
/**
 * Widget position schema
 */
export const ClientWidgetPositionSchema = z.enum([
  'bottom-right', 
  'bottom-left', 
  'top-right', 
  'top-left'
]);

/**
 * Background section configuration schema
 */
export const ClientBackgroundSectionSchema = z.object({
  type: z.enum(['solid', 'gradient', 'image', 'none']).optional(),
  colorStart: ClientHexColorSchema.optional(),
  colorEnd: ClientHexColorSchema.optional(),
  image: ClientURLSchema.nullable().optional(),
});

export type ClientBackgroundSection = z.infer<typeof ClientBackgroundSectionSchema>;

/**
 * Layered branding configuration (client edition).
 * Mirrors LayerConfigSchema in the canonical schema so client payloads validate
 * the same shape, without importing the canonical module (kept independent).
 */
export const ClientLayerConfigSchema = z.object({
  type: z.enum(['none', 'solid', 'gradient', 'image']),
  value: z.string().nullable(),
  opacity: z.number().min(0).max(1.0),
  backdropBlur: z.boolean(),
});

export type ClientLayerConfig = z.infer<typeof ClientLayerConfigSchema>;

export const ClientBrandingSchema = z.object({
  primaryColor: ClientHexColorSchema.optional(),
  accentColor: ClientHexColorSchema.optional(),
  logoUrl: z.string().url().or(z.string().startsWith('/')).or(z.literal('')).nullable().optional(),
  customButtonStyles: z.record(z.string()).optional(),
  widgetBodyOpacity: z
    .number()
    .min(0)
    .max(1)
    .nullable()
    .optional(),
  widgetBodyBackground: z.string().nullable().optional(),
  widgetPosition: ClientWidgetPositionSchema.optional(),
  headerConfig: ClientBackgroundSectionSchema.optional(),
  footerConfig: ClientBackgroundSectionSchema.optional(),
  header: ClientLayerConfigSchema.optional(),
  footer: ClientLayerConfigSchema.optional(),
  widgetBody: ClientLayerConfigSchema.optional(),
}).passthrough();

export type ClientBranding = z.infer<typeof ClientBrandingSchema>;

// ============================================================================
// Widget Studio Schema (Client Edition)
// ============================================================================

/**
 * Complete widget studio configuration for client portal.
 * Combines AI persona and branding customizations.
 * 
 * @property aiPersona - AI assistant personality configuration
 * @property branding - Client branding with studio customizations
 * 
 * @example
 * {
 *   aiPersona: {
 *     name: "Studio Assistant",
 *     voiceId: "voice-123",
 *     personality: "friendly",
 *     conversationStyle: "Use casual language"
 *   },
 *   branding: {
 *     primaryColor: "#FF5733",
 *     customButtonStyles: {
 *       primary: "background: linear-gradient(...)"
 *     }
 *   }
 * }
 */

// Per-integration configuration. Kept deliberately permissive (passthrough)
// so new add-on fields can be added without a schema migration, but the
// explicit fields below are validated for shape/type safety.
export const ClientIntegrationConfigSchema = z
  .object({
    enabled: z.boolean().optional(),
    // Smart Booking
    calendarLink: z.string().url().or(z.string().startsWith('/')).nullable().optional(),
    bookingWindow: z.enum(['Business hours', '24/7', 'Weekdays only']).optional(),
    // Live Inventory
    inventoryApi: z.string().url().or(z.string().startsWith('/')).nullable().optional(),
    syncFrequency: z.enum(['Every 5 min', 'Every 30 min', 'Hourly']).optional(),
    // CRM Lead Sync
    crmProvider: z.enum(['HubSpot', 'Salesforce', 'Pipedrive', 'Zoho']).optional(),
    crmApiKey: z.string().optional(),
    crmPushCadence: z.enum(['Realtime', 'Every 15 min', 'Daily batch']).optional(),
    // Vector Knowledge-Base
    vectorSources: z.array(z.string()).optional(),
    // WhatsApp / SMS
    messagingChannel: z.enum(['WhatsApp', 'SMS', 'Both']).optional(),
    twilioAuthToken: z.string().optional(),
    businessPhone: z.string().nullable().optional(),
  })
  .passthrough();

export type ClientIntegrationConfig = z.infer<typeof ClientIntegrationConfigSchema>;

// The full integrations payload: a map of integration id → config.
export const ClientIntegrationsSchema = z
  .record(ClientIntegrationConfigSchema)
  .optional();

export type ClientIntegrations = z.infer<typeof ClientIntegrationsSchema>;

// Field names whose values are treated as sensitive credentials. They are
// encrypted at the API boundary before being persisted into widget_config.
export const SENSITIVE_INTEGRATION_FIELDS = [
  'crmApiKey',
  'twilioAuthToken',
] as const;

export type SensitiveIntegrationField = (typeof SENSITIVE_INTEGRATION_FIELDS)[number];

export const ClientSuggestedActionSchema = z.object({
  label: z.string().min(1),
  actionType: z.enum(['message', 'link']),
  payload: z.string().min(1),
});

export const ClientWidgetStudioSchema = z.object({
  aiPersona: ClientAIPersonaSchema.optional(),
  branding: ClientBrandingSchema.optional(),
  integrations: ClientIntegrationsSchema,
  suggestedActions: z.array(ClientSuggestedActionSchema).optional(),
  features: z
    .object({
      aiInsightBadge: z.boolean().optional(),
      aiDesignMirror: z.boolean().optional(),
      customCss: z.boolean().optional(),
      customCssCode: z.string().optional(),
    })
    .passthrough()
    .optional(),
}).passthrough();

export type ClientWidgetStudio = z.infer<typeof ClientWidgetStudioSchema>;

// ============================================================================
// Validation Utilities
// ============================================================================

/**
 * Parse and validate client widget studio configuration.
 * Throws ZodError if validation fails.
 */
export function validateClientWidgetStudio(data: unknown): ClientWidgetStudio {
  return ClientWidgetStudioSchema.parse(data);
}

/**
 * Safely parse and validate client widget studio configuration.
 * Returns a result object instead of throwing.
 */
export function safeParseClientWidgetStudio(
  data: unknown
): { success: true; data: ClientWidgetStudio } | { success: false; error: z.ZodError<ClientWidgetStudio> } {
  return ClientWidgetStudioSchema.safeParse(data);
}

/**
 * Extract a nested value from client widget studio config with type safety.
 */
export function extractClientConfigValue<T>(
  config: ClientWidgetStudio,
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

// ============================================================================
// Runtime Validation Methods (No-Config Approach)
// ============================================================================

/**
 * Attach validation methods directly to schema for runtime checks.
 * This allows validation without external test framework configuration.
 */
export const ClientConfigValidation = {
  /**
   * Validate a complete widget studio configuration.
   * Returns { valid: true, data, errors } for safe runtime use.
   */
  validateStudio(input: unknown): { valid: boolean; data?: ClientWidgetStudio; errors?: string[] } {
    const result = safeParseClientWidgetStudio(input);
    if (result.success) {
      return { valid: true, data: result.data };
    }
    const errors = result.error.errors.map(err => 
      `${err.path.join('.')}: ${err.message}`
    );
    return { valid: false, errors };
  },

  /**
   * Validate just the AI persona.
   */
  validatePersona(input: unknown): { valid: boolean; data?: ClientAIPersona; errors?: string[] } {
    const result = ClientAIPersonaSchema.safeParse(input);
    if (result.success) {
      return { valid: true, data: result.data };
    }
    const errors = result.error.errors.map(err => 
      `${err.path.join('.')}: ${err.message}`
    );
    return { valid: false, errors };
  },

  /**
   * Validate just the branding.
   */
  validateBranding(input: unknown): { valid: boolean; data?: ClientBranding; errors?: string[] } {
    const result = ClientBrandingSchema.safeParse(input);
    if (result.success) {
      return { valid: true, data: result.data };
    }
    const errors = result.error.errors.map(err => 
      `${err.path.join('.')}: ${err.message}`
    );
    return { valid: false, errors };
  },
};
