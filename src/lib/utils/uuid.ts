/**
 * UUID v4 regex — matches the standard 8-4-4-4-12 hexadecimal format.
 *
 * - Version nibble (13th character) must be `4`
 * - Variant nibble (17th character) must be `8`, `9`, `a`, or `b`
 *
 * This pattern is intentionally strict. DO NOT relax it to a generic
 * 36-char hex regex, as that can match non-UUID hyphenated strings
 * and defeat the early-exit optimisation in resolve-reseller.ts.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Checks whether a string is a valid UUID v4.
 *
 * Use this to branch on identifier type before hitting the database,
 * avoiding the sequential "slug → tenant_id" fallback pattern.
 *
 * @param value - The string to test.
 * @returns `true` if the string is a well-formed UUID v4.
 *
 * @example
 *   isValidUUID('284931b2-6720-476e-ba05-f0a50edc5f06') // → true
 *   isValidUUID('lastchaptermedia2016')                  // → false
 */
export function isValidUUID(value: string): boolean {
  return UUID_RE.test(value);
}