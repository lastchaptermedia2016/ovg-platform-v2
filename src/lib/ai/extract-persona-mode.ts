/**
 * @file extract-persona-mode.ts
 *
 * Shared persona-mode detector used by both the AI endpoint
 * (`src/lib/ai/intent-mapper.ts`) and the client-surface command endpoint
 * (`src/app/api/client/process-command/route.ts`).
 *
 * Pure function — no imports, no side effects — so it is safe to copy into any
 * surface without dragging cross-surface dependencies.
 */

/**
 * Detect a persona-mode switch ("concierge" / "sales"). Matches the bare keyword
 * or the keyword preceded by a mode-intent phrase ("switch to", "set persona to",
 * "use ... mode", "make it ...", "change the persona to"). Returns the resolved
 * mode, or null when no persona directive is present.
 */
export function extractPersonaMode(rawText: string): 'sales' | 'concierge' | null {
  const text = rawText.toLowerCase();
  const hasModePhrase =
    /(switch|change|set|make|use|turn|put|switch over)\b.*\b(mode|persona)|persona\s*(mode|to|is)|(to|as)\s*(concierge|sales)\b/.test(
      text
    );
  // Direct keyword hit is enough; otherwise require a mode-intent phrase.
  if (/\bconcierge\b/.test(text)) return 'concierge';
  if (/\bsales\b/.test(text)) {
    // Avoid false positives: "sales" alone outside a persona context is ambiguous,
    // so only accept it when a mode-intent phrase is also present.
    return hasModePhrase ? 'sales' : null;
  }
  return null;
}

/**
 * Detect a persona-mode *request* that is missing its target mode — e.g.
 * "update persona mode", "change my persona". Returns true when the utterance
 * clearly asks to adjust the persona/AI mode but `extractPersonaMode` could not
 * resolve a concrete `'sales' | 'concierge'` value.
 *
 * Used for screen-aware clarification: rather than blindly navigating (or
 * asking the LLM), the endpoint can respond deterministically with a tailored
 * "which mode — sales or concierge?" prompt.
 *
 * Guards against false positives:
 *  - A concrete mode is present → false (that path resolves via `extractPersonaMode`).
 *  - Bare educational mentions ("what is a persona?") with no change verb → false.
 */
export function hasPersonaModeIntent(rawText: string): boolean {
  if (extractPersonaMode(rawText)) return false;
  const text = rawText.toLowerCase();
  const actionVerb = /(switch|change|set|update|make|use|turn|put|toggle|adjust|configure|edit|apply)/i.test(
    text,
  );
  const mentionsPersona = /(persona|mode)/i.test(text);
  return actionVerb && mentionsPersona;
}
