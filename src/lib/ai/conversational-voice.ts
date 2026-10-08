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

// ──────────────────────── Public Widget Lead-Capture Parsing ────────────────

/**
 * A parsed name/phone pair extracted from a visitor message during a
 * booking-intake conversation.
 *
 * Both fields are nullable: a message may contain a phone but no name, or a
 * name but no phone. Callers should only persist a lead when BOTH are present
 * (the dashboard groups leads by phone, so a name-only row is noise).
 */
export interface ParsedContact {
  name: string | null;
  phone: string | null;
}

/**
 * Match a phone number block inside a message.
 *
 * Accepts 7-15 digits with optional leading `+`, spaces, dashes, dots, and
 * parentheses — the common formats a visitor might type or dictate. The
 * stored value is canonical (digits only).
 *
 * Deliberately does NOT anchor to start/end of string: a phone can appear
 * mid-sentence ("Call me at 082 123 4567 if that works"). The character class
 * is bounded to digit/separator chars only, so a name's letters can never
 * be swallowed into the match.
 */
const PHONE_BLOCK_REGEX = /\+?[\d\s\-().()]{6,}\d/g;

/**
 * Heuristic name extraction. After stripping the phone, what remains is the
 * visitor's name — typically the first 1-4 words of the message, before any
 * sentence boundary. We keep it short and reject obvious non-name signals
 * (bot prompts, the intake script itself, common filler).
 */
const NON_NAME_PATTERNS = [
  /^i can get that scheduled/i,
  /^what is your name/i,
  /^my name is/i,
  /^call me at/i,
  /^reach me on/i,
  /^here if you/i,
  /^i'm here/i,
];

/**
 * Structured name patterns — tried BEFORE the first-words heuristic so that
 * conversational wrappers ("My name is Sarah", "I'm Jill", "this is Carlos")
 * collapse to the bare name instead of being stored verbatim as the lead's
 * client_name. Kept in sync with the patterns in booking-capture.ts; both
 * modules are leaf modules with no shared server dependency, so the regexes
 * are duplicated on purpose to keep each self-contained.
 */
const NAME_PATTERNS = [
  /\b(?:i(?:'m| am)|my name is|this is|it is|name['’]?s)\s+([A-Z][a-z]{1,40})/i,
  /\b(?:call me|reach me|contact me|find me)\s+at\s+([A-Z][a-z]{1,40})/i,
  /\b(?:call me|reach me|contact me|find me)\s+([A-Z][a-z]{1,40})(?![\s\d])/i,
  /\bit'?s\s+([A-Z][a-z]{1,40})\b/i,
  /\b(?:i go by|i go by the name of|you can call me)\s+([A-Z][a-z]{1,40})/i,
];

function extractStructuredName(text: string): string | null {
  for (const re of NAME_PATTERNS) {
    const m = text.match(re);
    if (m && m[1]) {
      const name = m[1].trim().slice(0, 120);
      if (name && !NON_NAME_PATTERNS.some((p) => p.test(name))) return name;
    }
  }
  return null;
}

/**
 * Extract a visitor name and phone number from a free-text message.
 *
 * Pure and side-effect free. Designed for the public widget chat pipeline,
 * where the AI concierge asks for name + phone and the visitor replies with
 * both in a single message (e.g. "Peter, 8897897890" or "It's Sarah —
 * 0825551212").
 *
 * @returns `{ name: null, phone: null }` when no usable contact is present.
 */
export function parseVisitorContact(message: string): ParsedContact {
  if (!message || typeof message !== 'string') return { name: null, phone: null };
  const text = message.trim();
  if (!text) return { name: null, phone: null };

  // 1. Extract the first phone block (canonical digits only).
  PHONE_BLOCK_REGEX.lastIndex = 0;
  const phoneMatch = PHONE_BLOCK_REGEX.exec(text);
  const rawPhone = phoneMatch ? phoneMatch[0] : null;
  const phone = rawPhone ? rawPhone.replace(/\D/g, '') : null;
  if (!rawPhone || !phone || phone.length < 7) return { name: null, phone: null };

  // 2. Strip the RAW phone block (with its formatting) to recover the name.
  // Stripping the canonical digits alone would leave the separators behind,
  // so we remove the exact matched substring instead.
  const withoutPhone = text
    .replace(rawPhone.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), '')
    .replace(/[\s,;:—\-]+$/g, '')
    .trim();

  let name: string | null = null;
  // Prefer structured patterns ("My name is Sarah", "I'm Jill") over the
  // first-words heuristic so conversational wrappers don't leak into client_name.
  name = extractStructuredName(text);
  if (!name && withoutPhone) {
    // Take the first 1-4 words as the candidate name, dropping any pure-
    // punctuation tokens (leftover separators like an em-dash that the
    // phone regex skipped over because it isn't a digit/separator char).
    const words = withoutPhone
      .split(/\s+/)
      .filter(Boolean)
      .filter((w) => /[A-Za-z']/.test(w));
    const candidate = words.slice(0, 4).join(' ');
    const cleaned = candidate.replace(/^[^A-Za-z'']+/, '').trim();
    if (cleaned && !NON_NAME_PATTERNS.some((p) => p.test(cleaned))) {
      name = cleaned;
    }
  }

  return { name, phone };
}

/**
 * True when a message looks like it is answering the booking-intake question
 * (i.e. it carries a phone number). Used by the widget pipeline to decide
 * whether to persist a lead row.
 */
export function hasContactDetails(message: string): boolean {
  return parseVisitorContact(message).phone !== null;
}
