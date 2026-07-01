/**
 * Configuration options for deep merge operations
 */
export interface DeepMergeOptions {
  /**
   * If true, array values will be concatenated instead of replaced.
   * Default: false (arrays are replaced)
   */
  mergeArrays?: boolean;
}

/**
 * Checks if a value is a plain object (not null, not array, not primitive).
 * Used to determine if a value should be merged recursively.
 *
 * @param value - The value to check
 * @returns true if the value is a plain object, false otherwise
 */
function isPlainObject(
  value: unknown
): value is Record<string, Record<string, unknown> | unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    value.constructor === Object
  );
}

/**
 * Performs a deep merge of two objects, recursively combining properties
 * from the source into the target while handling arrays and nested objects.
 *
 * @template T - The type of the target object
 *
 * @param target - The base object to merge into (will be modified)
 * @param source - The object with values to merge from
 * @param options - Optional configuration for merge behavior
 *
 * @returns The merged object (same reference as target)
 *
 * @example
 * ```typescript
 * const existing = {
 *   theme: { colors: { primary: '#000', secondary: '#fff' } },
 *   integrations: { domains: ['a.com', 'b.com'] }
 * };
 *
 * const update = {
 *   theme: { colors: { primary: '#00f' } },
 *   integrations: { domains: ['c.com'] }
 * };
 *
 * const result = deepMerge(existing, update);
 * // result.theme.colors.primary = '#00f' (updated)
 * // result.theme.colors.secondary = '#fff' (preserved)
 * // result.integrations.domains = ['c.com'] (replaced)
 * ```
 *
 * @remarks
 * - Arrays are completely replaced by default (not concatenated or merged)
 * - Use `{ mergeArrays: true }` option to concatenate arrays instead
 * - Null and undefined values in source replace existing values in target
 * - The target object is mutated; the same reference is returned
 * - Only plain objects are merged recursively; other values are replaced
 */
export function deepMerge<T extends Record<string, unknown>>(
  target: T,
  source: Partial<T>,
  options: DeepMergeOptions = {}
): T {
  const { mergeArrays = false } = options;

  // Iterate through all keys in the source object
  for (const key in source) {
    // Use hasOwnProperty to ensure we only process direct properties
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      const sourceValue = source[key];
      const targetValue = target[key];

      // Handle arrays
      if (Array.isArray(sourceValue)) {
        if (mergeArrays && Array.isArray(targetValue)) {
          // Concatenate arrays if option is enabled
          target[key] = [...targetValue, ...sourceValue] as T[Extract<
            keyof T,
            string
          >];
        } else {
          // Replace array completely (default behavior)
          target[key] = sourceValue as T[Extract<keyof T, string>];
        }
      }
      // Handle nested objects
      else if (
        isPlainObject(sourceValue) &&
        isPlainObject(targetValue)
      ) {
        // Recursively merge nested objects
        deepMerge(
          targetValue as Record<string, unknown>,
          sourceValue as Record<string, unknown>,
          options
        );
      } else {
        // Replace with new value (including null/undefined)
        target[key] = sourceValue as T[Extract<keyof T, string>];
      }
    }
  }

  return target;
}
