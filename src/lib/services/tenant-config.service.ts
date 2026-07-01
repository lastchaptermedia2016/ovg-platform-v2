/**
 * Tenant Configuration Service
 *
 * Provides payload normalization and diff computation for tenant widget configuration updates.
 * This service acts as an adapter layer between heterogeneous frontend clients and the
 * canonical WidgetConfigSchema, eliminating payload contract mismatch.
 *
 * @module tenant-config.service
 */

/**
 * Incoming payload types from various frontend clients.
 * Each client has a different shape; this union captures all known formats.
 *
 * @example
 * // From ClientBrandingStudio
 * { tenantId: "...", branding: {...}, features: {...} }
 *
 * // From useAICommand
 * { tenantId: "...", configPatch: {...} }
 *
 * // Future flexibility
 * { tenantId: "...", [key: string]: unknown }
 */
export type LegacyPayload =
  | { tenantId: string; branding?: Record<string, unknown>; features?: Record<string, unknown>; [key: string]: unknown }
  | { tenantId: string; configPatch?: Record<string, unknown>; [key: string]: unknown }
  | { tenantId: string; [key: string]: unknown };

/**
 * Normalized output structure that matches WidgetConfigSchema.
 * This is the canonical format used throughout the application.
 *
 * @example
 * {
 *   branding: { primaryColor: "#1A73E8", ... },
 *   theme: { colors: { ... }, ... },
 *   integrations: { domains: [...], ... },
 *   features: { aiInsightBadge: true, ... },
 *   ai_settings: { temperature: 0.7, ... }
 * }
 */
export interface NormalizedConfig {
  branding?: Record<string, unknown>;
  theme?: Record<string, unknown>;
  integrations?: Record<string, unknown>;
  features?: Record<string, unknown>;
  ai_settings?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Adapts heterogeneous incoming payloads to a normalized configuration structure.
 *
 * This function implements defensive structure detection to identify and extract the
 * relevant configuration data from any of the known frontend client payload formats.
 *
 * **Detection Logic:**
 * - If payload has `branding` OR `features` keys → ClientBrandingStudio format
 *   - Extract both objects and include them in the normalized structure
 * - Else if payload has `configPatch` key → useAICommand format
 *   - Use `configPatch` as the normalized structure (it's already properly formatted)
 * - Else → Treat entire payload (minus tenantId) as a partial widget_config
 *   - Return as-is for maximum flexibility
 *
 * @param incomingData - Raw, unknown payload from a frontend client
 * @returns Normalized configuration object matching WidgetConfigSchema shape
 *
 * @example
 * // ClientBrandingStudio input
 * const normalized = adaptPayload({
 *   tenantId: "123e4567-e89b-12d3-a456-426614174000",
 *   branding: { primaryColor: "#1A73E8" },
 *   features: { aiInsightBadge: true }
 * });
 * // Returns:
 * // { branding: { primaryColor: "#1A73E8" }, features: { aiInsightBadge: true } }
 *
 * @example
 * // useAICommand input
 * const normalized = adaptPayload({
 *   tenantId: "123e4567-e89b-12d3-a456-426614174000",
 *   configPatch: { theme: { colors: { primary: "#1A73E8" } } }
 * });
 * // Returns:
 * // { theme: { colors: { primary: "#1A73E8" } } }
 */
export function adaptPayload(incomingData: unknown): NormalizedConfig {
  // Defensive check: ensure we have an object
  if (!incomingData || typeof incomingData !== 'object') {
    return {};
  }

  const data = incomingData as Record<string, unknown>;

  // ── Detection: ClientBrandingStudio format ──
  if ('branding' in data || 'features' in data) {
    const normalized: NormalizedConfig = {};

    if (data.branding && typeof data.branding === 'object') {
      normalized.branding = data.branding as Record<string, unknown>;
    }

    if (data.features && typeof data.features === 'object') {
      normalized.features = data.features as Record<string, unknown>;
    }

    return normalized;
  }

  // ── Detection: useAICommand format ──
  if ('configPatch' in data && data.configPatch && typeof data.configPatch === 'object') {
    return data.configPatch as Record<string, unknown>;
  }

  // ── Fallback: Treat entire payload (minus tenantId) as partial config ──
  // This provides maximum flexibility for future clients
  const normalized: NormalizedConfig = {};

  for (const [key, value] of Object.entries(data)) {
    // Skip the tenantId and known wrapper keys
    if (key === 'tenantId' || key === 'configPatch') {
      continue;
    }

    // Include all other keys as-is
    normalized[key] = value;
  }

  return normalized;
}

/**
 * Delta structure for a single changed property.
 * Represents before/after values for audit trail purposes.
 */
interface PropertyDelta {
  from: unknown;
  to: unknown;
}

/**
 * Computes the delta (changes) between old and new configurations.
 *
 * This function identifies which keys have changed and by how much,
 * producing a delta object suitable for audit logging.
 *
 * **Logic:**
 * - For each key in newConfig:
 *   - If the value differs from oldConfig[key], include in delta with { from: old, to: new }
 *   - Missing keys in old are treated as undefined
 * - For each key in oldConfig not in newConfig:
 *   - Include as deletion with { from: old, to: undefined }
 * - Return null if no changes detected
 *
 * **Comparison Method:**
 * Deep equality is achieved by JSON serialization (sufficient for config objects).
 * This approach handles nested objects and arrays uniformly.
 *
 * @param oldConfig - Previous configuration state
 * @param newConfig - New configuration state
 * @returns Delta object keyed by changed property, or null if unchanged
 *
 * @example
 * const delta = computeDelta(
 *   { branding: { primaryColor: "#FF0000" } },
 *   { branding: { primaryColor: "#00FF00" }, features: { aiInsightBadge: true } }
 * );
 * // Returns:
 * // {
 * //   "branding": { from: { primaryColor: "#FF0000" }, to: { primaryColor: "#00FF00" } },
 * //   "features": { from: undefined, to: { aiInsightBadge: true } }
 * // }
 *
 * @example
 * const delta = computeDelta(
 *   { branding: { primaryColor: "#FF0000" } },
 *   { branding: { primaryColor: "#FF0000" } }
 * );
 * // Returns: null (no changes)
 */
export function computeDelta(
  oldConfig: Record<string, unknown>,
  newConfig: Record<string, unknown>
): Record<string, PropertyDelta> | null {
  const delta: Record<string, PropertyDelta> = {};

  // Check for additions and modifications in newConfig
  for (const [key, newValue] of Object.entries(newConfig)) {
    const oldValue = oldConfig[key];

    // Deep comparison using JSON serialization
    const oldSerialized = JSON.stringify(oldValue);
    const newSerialized = JSON.stringify(newValue);

    if (oldSerialized !== newSerialized) {
      delta[key] = {
        from: oldValue,
        to: newValue,
      };
    }
  }

  // Check for deletions in oldConfig
  for (const [key, oldValue] of Object.entries(oldConfig)) {
    if (!(key in newConfig)) {
      delta[key] = {
        from: oldValue,
        to: undefined,
      };
    }
  }

  // Return null if no changes detected
  return Object.keys(delta).length === 0 ? null : delta;
}
