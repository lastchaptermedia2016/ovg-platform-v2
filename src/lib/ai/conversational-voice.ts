/**
 * @file conversational-voice.ts
 *
 * ZEEDER Persona & Conversational Voice Guidelines.
 *
 * Single source of truth for the "humanlike" voice contract applied to every
 * summary the client command processor returns (LLM-generated or deterministic
 * template). Consumed by:
 *   - `@/lib/ai/system-prompt-builder` — injects {@link ZEEDER_VOICE_GUIDELINES}
 *     into the hydrated LLM system prompt so the model writes summaries in the
 *     ZEEDER voice from the first token.
 *   - `/api/client/process-command` — uses {@link humanizeSummary} to
 *     post-process model output (strip ellipses / trailing dots / mechanical
 *     openers) and {@link buildActionSummary} / {@link buildNavigationSummary}
 *     for the deterministic Tier-1 templates.
 *
 * Everything here is a pure, dependency-free leaf module so both the server
 * route and any 'use client' surface can import it without pulling in server
 * code. Client-surface safe (no reseller / admin imports).
 */

// ──────────────────────── LLM Prompt Block ────────────────────────

/**
 * The ZEEDER persona voice contract, injected verbatim into the LLM system
 * prompt. Kept in a single exported constant so the prompt and the runtime
 * normalizer can never drift apart.
 */
export const ZEEDER_VOICE_GUIDELINES = [
  '',
  '=== ZEEDER PERSONA & CONVERSATIONAL VOICE GUIDELINES ===',
  'These rules govern the "summary" field of your response. The summary is read out loud by Text-to-Speech, so it must sound like a warm human concierge, never like a machine.',
  '',
  '1. MANDATORY CONTRACTIONS: Always write naturally with contractions — "I\'m", "we\'ll", "let\'s", "it\'s", "you\'d", "we\'re", "didn\'t", "I\'ll". Never emit the uncontracted forms ("I am", "we will", "it is", "do not").',
  '2. HUMAN VIBE & NATURAL RHYTHM: Open with a real conversational acknowledgment — "On it!", "You got it—", "Gotcha,", "Heading over now,", "Taking you right to...", "Sure, I\'ll get on that", "Give me a sec". Vary your openers; never reuse the same one twice in a row.',
  '3. BANNED PHRASINGS: Never produce rigid or mechanical confirmations such as "Sure no problem opening...", "I will now open the requested page", "Your request has been processed", "The action has been executed", "Command received", or "Success: action completed". Never echo raw action identifiers (e.g. "SYSTEM_NAVIGATE", "SYSTEM_UPDATE_BRANDING") to the user.',
  '4. NO TRAILING DOTS OR ELLIPSES: Never end a summary with "...", "..", or a run of dots like ".........". A single terminal "." is fine; a trailing ellipsis is not.',
  '5. PUNCHY LENGTH: Keep action summaries to ONE short, natural sentence (roughly 6-16 words) — a quick confirmation, not a status report. Only use two sentences when you must also ask a clarifying question.',
  '6. READS WELL OUT LOUD: No markdown, no bullet points, no parentheses, no emoji, no ALL-CAPS shouting, and no raw route paths like "/client/dashboard/studio/branding" — name the place in plain words ("your branding settings").',
  '7. WARM CONFIDENCE: Be helpful and upbeat. Skip flattery, filler ("as an AI"), and mechanical sign-offs.',
].join('\n');

// ──────────────────────── Summary Normalization ────────────────────────

/**
 * Mechanical openers the models still occasionally emit, mapped to their human
 * equivalents. Applied only at the start of a summary, so an in-sentence use
 * of "of course" or "sure" is left untouched.
 */
const MECHANICAL_OPENERS: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /^(?:sure\s+no\s+problem|sure\s+thing|sure\s+enough|sure|okay|ok|alright|got\s+it|understood|acknowledged)\b[,.!:\s]*/i, replacement: 'On it! ' },
  { pattern: /^(?:certainly|absolutely|definitely)\b[,.!:\s]*/i, replacement: 'You got it—' },
  { pattern: /^(?:of\s+course)\b[,.!:\s]*/i, replacement: 'For you—' },
  { pattern: /^(?:as\s+an\s+ai(?:\s+assistant)?)\b[,.!:\s]*/i, replacement: '' },
  { pattern: /^(?:i(?:'ll|\s+will)\s+(?:now\s+)?(?:proceed\s+to\s+)?(?:open|navigate|execute|switch|update|change|enable|disable)\b)\s*/i, replacement: 'On it—' },
];

/**
 * Normalize any summary (LLM output or template) for TTS delivery.
 *
 * Guarantees, in order:
 *  1. Whitespace/newlines collapse to single spaces.
 *  2. Mechanical / robotic openers are swapped for conversational ones.
 *  3. Trailing ellipses and trailing dots are removed ("branding page........." → "branding page").
 *  4. A terminal "!" is added when the sentence has no closing punctuation,
 *     keeping the readout punchy.
 *
 * Never returns an empty string — `fallback` is used whenever the cleaned
 * input is blank.
 *
 * @param raw - The untrusted summary text (LLM output or template).
 * @param fallback - Conversational string used when `raw` cleans to empty.
 */
export function humanizeSummary(raw: string | null | undefined, fallback: string): string {
  let text = (raw ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return fallback;

  for (const { pattern, replacement } of MECHANICAL_OPENERS) {
    const replaced = text.replace(pattern, replacement).trim();
    // Only keep the swap when something meaningful remains (e.g. "Sure." → "On it!").
    if (replaced.length >= 2) text = replaced;
  }

  // Strip trailing ellipses / dot runs, then any other trailing whitespace.
  text = text.replace(/[.]{2,}\s*$/, '').replace(/\s*\.\s*$/, '').trim();
  if (!text) return fallback;

  // Guarantee a terminal punctuation mark for a natural-sounding TTS cadence.
  if (!/[!?.]$/.test(text)) text = `${text}!`;
  return text;
}

// ──────────────────────── Action Templates ────────────────────────

/**
 * Plain-English names for the client surface routes, so navigation summaries
 * never leak a raw path such as "/client/dashboard/studio/branding".
 *
 * Keys are the REAL routes only (verified against `src/app/client/**`). The
 * entries that used to live here — `/client`, `/client/dashboard/memories`,
 * `/client/dashboard/analytics`, `/client/dashboard/settings` — were removed
 * because no such page exists; keeping them meant a spoken confirmation for a
 * screen the user could never actually land on. `integrations` was added when
 * that viewport landed and was otherwise labelled "that screen".
 */
const PAGE_LABELS: Record<string, string> = {
  '/client/dashboard': 'your dashboard',
  '/client/dashboard/studio/branding': 'your branding settings',
  '/client/dashboard/studio/persona': 'your persona settings',
  '/client/dashboard/studio/knowledge': 'your knowledge base',
  '/client/dashboard/studio/integrations': 'your integrations',
};

/**
 * Human label for a client-surface route, falling back to a neutral phrase
 * when the path is unknown so we never speak a URL.
 */
export function pageLabel(href: string): string {
  const normalized = href.replace(/\/+$/, '') || '/';
  return PAGE_LABELS[normalized] ?? 'that screen';
}

/**
 * Warm, single-sentence confirmation for a deterministic navigation action.
 *
 * @example buildNavigationSummary('/client/dashboard/studio/branding')
 * // → "You got it—taking you straight to your branding settings."
 */
export function buildNavigationSummary(href: string): string {
  return humanizeSummary(`On it! Taking you straight to ${pageLabel(href)}`, 'On it! Taking you there now.');
}

/**
 * Warm, single-sentence confirmations for each dispatchable client action
 * type. Any action type without an entry falls through to the generic
 * "taking care of that" template — never a raw identifier.
 */
const ACTION_ACKS: Record<string, string> = {
  SYSTEM_UPDATE_BRANDING: 'On it! Taking you straight to your branding settings.',
  SYSTEM_UPDATE_PERSONA: "You got it—heading over to your persona settings now.",
  SYSTEM_MANAGE_MEMORY: 'On it! Taking you to your knowledge base now.',
  SYSTEM_PUBLISH_DRAFT: 'On it! Publishing your changes right now.',
  SYSTEM_TELEMETRY: 'Heading over to your telemetry signals now.',
  SYSTEM_TOGGLE_AGENT: "Gotcha, toggling that agent for you right now.",
  SYSTEM_HELP: "Let me pull up everything you can do here.",
  SYSTEM_BOOKING_CAPTURE: "On it! Let's get that booking sorted now.",
  SYSTEM_EXPLAIN: 'Good question—let me break that down for you.',
  SYSTEM_NAVIGATE: 'On it! Taking you right where you need to be.',
};

/**
 * Build a conversational confirmation for a Tier-1 resolved action.
 *
 * @param actionType - The resolved `SYSTEM_*` action type.
 * @param options.href - Optional navigation target used to name the place in
 *   plain words instead of echoing the route.
 * @param options.enabled - Optional boolean state for on/off actions, so the
 *   summary can say what actually changed ("switching to dark mode") rather
 *   than a generic acknowledgement.
 * @param options.label - Optional human label (e.g. "dark mode") used with
 *   `enabled`.
 */
export function buildActionSummary(
  actionType: string,
  options: { href?: string | null; enabled?: boolean | null; label?: string | null } = {},
): string {
  if (actionType === 'SYSTEM_NAVIGATE' && options.href) {
    return buildNavigationSummary(options.href);
  }

  if (typeof options.enabled === 'boolean' && options.label) {
    const state = options.enabled ? `turning ${options.label} on` : `switching off ${options.label}`;
    return humanizeSummary(`Gotcha, ${state} now`, 'On it! Taking care of that right now.');
  }

  return humanizeSummary(
    ACTION_ACKS[actionType] ?? 'On it! Taking care of that for you right now.',
    'On it! Taking care of that for you right now.',
  );
}
