/**
 * Speech-friendly phone formatting for TTS payloads.
 *
 * The TTS engine reads a long, unbroken digit run (e.g. "27760330046") as a
 * single large number ("twenty-seven billion …") instead of a phone number.
 * Inserting block separators ("277 603 300 46") forces the engine to read the
 * number block-by-block, so booking confirmations that echo a phone number
 * sound natural.
 *
 * IMPORTANT: this transformation is applied ONLY to the spoken text handed to
 * `/api/ai/speech`. The on-screen chat message keeps the clean, canonical
 * format the AI produced — visual UI is never altered by this module.
 *
 * Pure leaf module: no DOM, no AudioContext, no React. Safe to unit-test in
 * Node and to import from any 'use client' component.
 */

/** Digit-count bounds for a run to be considered a phone number. */
const MIN_PHONE_DIGITS = 7;
const MAX_PHONE_DIGITS = 15;

/**
 * Matches a candidate phone-like token: an optional leading '+', a digit, then
 * any mix of digits and common separators (space, dash, dot, parens), ending on
 * a digit. Bounded so it cannot run off a number into following words — the
 * inner group must terminate on a digit.
 */
const PHONE_CANDIDATE_RE = /\+?\d(?:[\d\s().-]*\d)?/g;

/** Strip a formatted/separated run down to its digits + optional leading '+'. */
function extractDigits(token: string): { plus: boolean; digits: string } {
  const plus = token.trimStart().startsWith('+');
  const digits = token.replace(/\D/g, '');
  return { plus, digits };
}

/**
 * Group a digit string into TTS-friendly blocks of three from the left. A
 * trailing lone digit is merged into the previous block so we never emit an
 * isolated single digit (e.g. "083 123 456 7" → "083 123 4567").
 */
function groupDigits(digits: string): string {
  const blocks: string[] = [];
  for (let i = 0; i < digits.length; i += 3) {
    blocks.push(digits.slice(i, i + 3));
  }
  const last = blocks.length - 1;
  if (last > 0 && blocks[last].length === 1) {
    blocks[last - 1] += blocks[last];
    blocks.pop();
  }
  return blocks.join(' ');
}

/**
 * Reformat any phone-number-like tokens inside `text` into spoken block
 * format. Non-phone text is returned untouched; tokens whose digit count falls
 * outside the 7–15 phone range are left exactly as-is (so years, prices, and
 * short reference codes are not mangled).
 *
 * @param text - The message body destined for the TTS engine.
 * @returns The same text with phone-like digit runs regrouped for speech.
 */
export function formatPhoneForSpeech(text: string): string {
  if (!text) return text;
  return text.replace(PHONE_CANDIDATE_RE, (match) => {
    const { plus, digits } = extractDigits(match);
    if (digits.length < MIN_PHONE_DIGITS || digits.length > MAX_PHONE_DIGITS) {
      return match;
    }
    return `${plus ? '+' : ''}${groupDigits(digits)}`;
  });
}
