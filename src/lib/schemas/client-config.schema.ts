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
export const ClientAIPersonaSchema = z.object({
  name: z.string().min(1, 'Persona name is required'),
  voiceId: z.string().min(1, 'Voice ID is required'),
  personality: z.enum(['professional', 'friendly', 'minimalist', 'direct']),
  conversationStyle: z.string().optional(),
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
export const ClientBrandingSchema = z.object({
  primaryColor: ClientHexColorSchema.optional(),
  accentColor: ClientHexColorSchema.optional(),
  logoUrl: ClientURLSchema.nullable().optional(),
  customButtonStyles: z.record(z.string()).optional(),
  widgetBodyOpacity: z
    .number()
    .min(0)
    .max(1)
    .optional(),
  widgetBodyBackground: z.string().optional(),
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
export const ClientWidgetStudioSchema = z.object({
  aiPersona: ClientAIPersonaSchema.optional(),
  branding: ClientBrandingSchema.optional(),
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
