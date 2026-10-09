/**
 * @file affirmative-nav.ts
 *
 * Pure helpers for resolving an affirmative follow-up after the assistant
 * offers to navigate somewhere (e.g. "Would you like me to take you there to
 * review them?" → user replies "Yes, please." / "take me there").
 *
 * Two independent questions, each a pure predicate so the voice hook
 * (`useZeederVoice`) and its unit tests share ONE source of truth:
 *   - {@link isNavigationOffer} — did the assistant's spoken reply OFFER nav?
 *   - {@link isAffirmativeUtterance} — is the user's next reply a bare "yes"?
 *
 * When both are true across two consecutive turns, the hook navigates locally
 * (router.push + TTS) without a backend round-trip, so the follow-up never
 * dead-ends at CLIENT_NOP.
 *
 * Pure leaf module: no DOM, no React. Safe to unit-test in Node.
 */

/**
 * Anchored FULL match for a bare affirmative. Deliberately strict so compound
 * utterances ("yes, and also update my branding") are NOT intercepted — they
 * fall through to the normal `/api/client/process-command` pipeline.
 */
const AFFIRMATIVE_REGEX =
  /^(?:yes(?:\s*,?\s*(?:please|yeah|ya|sir|ma'am))?|yep|yup|yeah|sure(?:\s+thing)?|okay|ok|please|go ahead|take me there|do it|sounds good)[.!?,?\s]*$/i;

/**
 * True when `text` is a standalone affirmative the user would say to accept a
 * pending navigation offer.
 *
 * @example isAffirmativeUtterance('Yes, please.') // true
 * @example isAffirmativeUtterance('take me there') // true
 * @example isAffirmativeUtterance('yes and change my branding') // false
 */
export function isAffirmativeUtterance(text: string): boolean {
  return AFFIRMATIVE_REGEX.test(text.trim());
}

/**
 * Phrases that mark an assistant reply as a navigation OFFER (a question), as
 * opposed to a confirmation of a navigation already performed ("Taking you
 * straight to …"). Matched against the spoken summary so the hook arms its
 * local pending-nav target only when the assistant is actually asking.
 */
const NAV_OFFER_REGEX = /take you there|review them|would you like me to take/i;

/**
 * True when the assistant's spoken `summary` is offering to take the user
 * somewhere (so a following affirmative should resolve to navigation).
 *
 * @example isNavigationOffer('…Would you like me to take you there to review them?') // true
 * @example isNavigationOffer('On it! Taking you straight to Appointment Requests.') // false
 */
export function isNavigationOffer(summary: string | null | undefined): boolean {
  return typeof summary === 'string' && NAV_OFFER_REGEX.test(summary);
}

/** The single navigational target the voice copilot currently offers. */
export const APPOINTMENTS_HREF = '/client/dashboard/appointments';
