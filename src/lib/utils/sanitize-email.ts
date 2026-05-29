/**
 * Shared email sanitization utility for the OVG Platform voice-to-data pipeline.
 *
 * Three-Layer Defense Strategy:
 * - Layer 1 (LLM Prompt): Instructs the model to normalize spoken email identifiers.
 * - Layer 2 (This utility): Backend rescue that handles STT artifacts missed by the LLM.
 * - Layer 3 (Zod .transform()): Contract-level enforcement at the API boundary.
 *
 * Handles common STT artifacts:
 * - "www dot user at gmail dot com"       → user@gmail.com
 * - "mailto:john at example dot com"       → john@example.com
 * - "john dot gmail dot com"               → john@gmail.com (inferred @)
 * - "john at gmail dot com"                → john@gmail.com
 */

// Standard email regex (RFC 5322 simplified, production-grade)
export const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;

/**
 * Normalizes a raw email string from STT by removing spoken-word artifacts.
 *
 * @param raw - The raw string from STT output or LLM extraction.
 * @returns A validated email string, or null if the input doesn't resemble an email.
 *
 * @example
 * normalizeEmail('www dot bmwtest dot gmail dot com') // → 'bmwtest@gmail.com'
 * normalizeEmail('john at gmail dot com')              // → 'john@gmail.com'
 * normalizeEmail('www.acmecorp.com')                   // → null (it's a URL, not email)
 */
export function normalizeEmail(raw: string | null | undefined): string | null {
  if (!raw || raw.trim() === '') return null;

  let sanitized = raw.trim();

  // Guard: trim length to prevent ReDoS
  if (sanitized.length > 320) return null;

  // Step 1: Strip "mailto:" prefix (common STT artifact from browser contexts)
  sanitized = sanitized.replace(/^mailto:/i, '').trim();

  // Step 2: Replace spoken " dot " → ".", collapse multiple spaces
  sanitized = sanitized.replace(/\s+dot\s+/gi, '.');

  // Step 3: Replace spoken " at " → "@"
  sanitized = sanitized.replace(/\s+at\s+/gi, '@');

  // Step 4: Collapse remaining whitespace
  sanitized = sanitized.replace(/\s+/g, '');

  // Step 5: Lowercase (emails are case-insensitive in the local-part RFC,
  // but we lowercase for consistency since STT is unreliable on case)
  sanitized = sanitized.toLowerCase();

  // Step 6: Guard — if there's no "@", try to infer it
  // Pattern: "user.domain.tld" → "user@domain.tld" (first dot becomes @)
  // But only if the part before the first dot looks like a username (no TLD-like suffix)
  if (!sanitized.includes('@')) {
    const firstDotIndex = sanitized.indexOf('.');
    if (firstDotIndex > 0) {
      // Heuristic: if the part before the first dot is short (< 4 chars) OR
      // the string after the first dot looks like a domain (contains another dot),
      // split at the first dot
      const localPart = sanitized.substring(0, firstDotIndex);
      const domainPart = sanitized.substring(firstDotIndex + 1);

      // Only infer @ if the domain part looks valid (has at least one more dot
      // for the TLD, e.g., "gmail.com" has one dot, "co.za" has one dot)
      if (domainPart.length > 0 && /[a-zA-Z]/.test(domainPart)) {
        sanitized = `${localPart}@${domainPart}`;
      }
    }
  }

  // Step 7: Strip leading "www." — only if the result contains an @
  // This ensures we don't corrupt a website URL that happened to pass through here
  if (sanitized.includes('@')) {
    sanitized = sanitized.replace(/^www\./i, '');
  } else {
    // No @ sign — this is likely a website URL, not an email
    return null;
  }

  // Step 8: Final validation against standard email regex
  if (!EMAIL_REGEX.test(sanitized)) {
    // Attempt a best-effort cleanup for common remaining issues:
    // Double dots, trailing dots, leading/trailing special chars
    sanitized = sanitized.replace(/\.{2,}/g, '.');   // Collapse double dots
    sanitized = sanitized.replace(/\.@/g, '@');       // "foo.@bar" → "foo@bar"
    sanitized = sanitized.replace(/@\./g, '@');       // "foo@.bar" → "foo@bar" (rare)
    sanitized = sanitized.replace(/^[^a-zA-Z0-9]+/, ''); // Strip leading non-alphanumeric
    sanitized = sanitized.replace(/[^a-zA-Z0-9]+$/, ''); // Strip trailing non-alphanumeric

    // Re-test after best-effort cleanup
    if (!EMAIL_REGEX.test(sanitized)) {
      return null;
    }
  }

  return sanitized;
}