/**
 * Step 4 (Vibe) input gating — pure helpers, zero DOM/framework deps.
 *
 * The vibe step used to accept ANY non-empty STT transcript, so tail speech
 * captured while the previous step's TTS prompt played ("next", "um, okay",
 * a leftover phone number) was written straight into `vibe` and immediately
 * satisfied STEP_REQUIREMENTS[4], firing completeVoiceEntry() prematurely.
 *
 * classifyVibeInput() forces a deliberate outcome before the dispatcher may
 * advance, so the step completes only on a real vibe or an explicit skip:
 *   - 'skip'   → explicit skip signal (mirrors the website step's product rule)
 *   - 'bleed'  → another step's data / tail speech → reprompt, never captured
 *   - 'filler' → hesitation, punctuation, or bare acknowledgement → reprompt
 *   - 'vibe'   → deliberate vibe text → captured (subject to MIN_VIBE_LENGTH)
 */

export type VibeInputKind = 'skip' | 'bleed' | 'filler' | 'vibe';

/** Shortest sanitized vibe text accepted as a deliberate answer. */
export const MIN_VIBE_LENGTH = 3;

/**
 * Deliberate, whole-utterance skip signals for the vibe step.
 * Anchored so a vibe sentence that merely contains "skip" (e.g.
 * "skip the formal tone") is still captured as a vibe.
 */
const VIBE_SKIP_PATTERN =
  /^(?:skip|next|done|pass|nope|none)(?:\s+(?:it|this(?:\s+step)?|step|vibe))?$|^no\s+vibe$/i;

/**
 * Markers that tie an utterance to a DIFFERENT voice step (email, contact,
 * website, name/industry capture) or to an open-ended command — i.e. STT
 * bleed from an earlier prompt rather than a vibe answer.
 */
const OTHER_STEP_MARKER_PATTERN = new RegExp(
  [
    '@', // email address
    '\\bhttps?:\\/\\/', // URL scheme
    '\\bwww\\.', // URL host
    '\\b(?:e-?mail|phone|mobile|website|category|industry)\\b', // other-step field keywords
    '\\bname\\s+is\\b', // name-step phrasing ("…name is Acme")
    '\\b(?:create|add|new)\\s+(?:a\\s+)?client\\b', // command prefix from step 0
    '(?:\\+?1[-.\\s]?)?\\(?\\d{3}\\)?[-.\\s]?\\d{3}[-.\\s]?\\d{4}', // formatted phone
    '\\b\\d{7,}\\b', // bare digit run (phone-like)
    '\\S+\\.(?:com|net|org|io|co|uk|ai|dev|app|gov|edu)\\b', // domain with common TLD
  ].join('|'),
  'i',
);

/** Whole-utterance hesitations and bare acknowledgements — not a vibe. */
const HESITATION_PATTERN =
  /^(?:um+|uh+|erm+|er+|ah+|eh+|hmm+|hm+|mhm+|mm+|huh+|ugh+|yep+|yeah+|yes|no|n|ok(?:ay)?|sure|alright|right|well|so|just|like|maybe|nothing|whatever|idk|no\s+idea|let'?s\s+see|hold\s+on|wait)[.!?,]*$/i;

/**
 * Classifies a raw step-4 transcript so unrelated tail speech cannot
 * satisfy STEP_REQUIREMENTS[4] and trigger completeVoiceEntry().
 *
 * A category restatement (even one merged with vibe-like text) is classified
 * as 'bleed': there is no unambiguous boundary between a co-delivered field
 * value and vibe text, so the user is asked to restate the vibe alone.
 */
export function classifyVibeInput(transcript: string): VibeInputKind {
  const stripped = transcript.trim();
  // Empty (or whitespace-only) input can never satisfy the step.
  if (!stripped) return 'bleed';
  if (VIBE_SKIP_PATTERN.test(stripped)) return 'skip';
  // Punctuation-only noise ("...", "?!") is a hesitation, never a vibe —
  // it would otherwise survive sanitizeValue as a length-0/short capture.
  if (!/[a-z0-9]/i.test(stripped)) return 'filler';
  if (OTHER_STEP_MARKER_PATTERN.test(stripped)) return 'bleed';
  if (HESITATION_PATTERN.test(stripped)) return 'filler';
  return 'vibe';
}
