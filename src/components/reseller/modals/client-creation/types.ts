/**
 * Shared domain types for the client-creation modal decomposition.
 * Consumed by the UniversalCommandModal container and its
 * client-creation sub-components (VoiceStepMachine, ManualClientForm,
 * ReviewSubmitStep).
 */

/** Multi-step voice entry steps: 0-3 capture, 4 = vibe → review hand-off. */
export type VoiceEntryStep = 0 | 1 | 2 | 3 | 4;

/** Fields tracked by the live voice-capture grid highlight (null = idle). */
export type HighlightedField =
  | 'name'
  | 'email'
  | 'industry'
  | 'category'
  | 'mobile'
  | 'website'
  | 'vibe'
  | null;

/** Draft payload produced by parse-only command handling. */
export interface DraftData {
  clientName: string;
  clientEmail: string;
  industry: string;
  category: string;
  mobile: string;
  website: string;
  systemPrompt: string;
  parsedFromVoice: boolean;
  is_override?: boolean;
  confidence?: number;
}

/** Atomic manual-entry form state (single source of truth). */
export interface FormState {
  name: string;
  email: string;
  industry: string;
  category: string;
  mobile: string;
  website: string;
  systemPrompt: string;
}

/** Fields accumulated across the guided voice entry flow. */
export interface VoiceEntryData {
  name: string;
  industry: string;
  category: string;
  email: string;
  mobile: string;
  website: string;
  vibe: string;
}

/** Editable summary bound to the review step. */
export interface ReviewData {
  name: string;
  industry: string;
  category: string;
  email: string;
  mobile: string;
  website: string;
  vibe: string;
}

/**
 * Extractor contract for processVoiceEntryStep: fields captured during this
 * attempt, plus an optional product-rule confirmation that satisfies the step
 * without producing data (e.g. an explicit website 'skip').
 */
export interface VoiceStepOutcome {
  captured: Partial<VoiceEntryData>;
  /** true = treat the step as satisfied regardless of STEP_REQUIREMENTS. */
  confirmed?: boolean;
}
