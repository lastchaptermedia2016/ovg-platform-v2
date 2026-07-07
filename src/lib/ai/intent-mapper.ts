/**
 * @file intent-mapper.ts
 *
 * Intent Mapping & Orchestration Layer.
 *
 * Bridges raw natural-language intent into a structured, executable *plan* of
 * actions for the ActionRegistry. This module NEVER executes — it only
 * proposes. Every produced intent is paired with a `confirmationPreview`
 * string the Conversational AI speaks before the human says "Yes" (voice
 * confirmation / human-in-the-loop).
 *
 * Design guarantees:
 *   - Validation: every step's payload is validated against the relevant
 *     canonical schema (via the registry's registered schema) before it is
 *     returned, so the plan is always well-formed.
 *   - Authorization: the mapper performs NO auth and NO DB access. It cannot
 *     run actions; it only builds `ActionIntent` proposals.
 *   - Clarification: ambiguous or incomplete intents return CLARIFICATION_REQUIRED
 *     with a targeted question for the user.
 *   - Context awareness: the current StudioDraft feeds context-aware hints
 *     (e.g. "you are editing the 'Standard' theme").
 */

import {
  CanonicalWidgetConfigSchema,
  type CanonicalWidgetConfig,
  type CanonicalBranding,
  type CanonicalFeatures,
} from '../schemas/tenant-config.canonical';
import { PersonaModeSchema, type ActionId } from '../actions/registry';
import { getBrandingTheme, type BrandingTheme } from './branding-concierge';

// ──────────────────────────────────────────────────────────────────────────────
// Studio draft context (read-only observation input — mirrors StudioDraftContext)
// ──────────────────────────────────────────────────────────────────────────────

export interface StudioDraftLike {
  primaryColor?: string;
  logoUrl?: string;
  widgetPosition?: string;
  header?: { type: 'none' | 'solid' | 'image'; image?: string; colorStart?: string };
  footer?: { type: 'none' | 'solid' | 'image'; image?: string; colorStart?: string };
  personaMode?: 'sales' | 'concierge';
  systemPrompt?: string;
  temperature?: number;
  voiceId?: string;
  /** Optional human label for the active theme/template being edited. */
  activeThemeName?: string;
}

// ──────────────────────────────────────────────────────────────────────────────
// Output model
// ──────────────────────────────────────────────────────────────────────────────

/** A single proposed action. The registry executes this only after voice-confirm. */
export interface ActionIntent {
  actionId: ActionId;
  payload: CanonicalWidgetConfig;
  /** Spoken/screened preview shown to the user before they approve. */
  confirmationPreview: string;
  /**
   * Human-readable rationale for WHY the AI chose this path. Populated by the
   * CognitiveOrchestrator so the user can audit each proposal (explainability).
   */
  explanation?: string;
}

export type MapperResult =
  | { status: 'PLAN_READY'; intents: ActionIntent[]; /** Combined preview for the whole plan. */ planPreview: string }
  | { status: 'CLARIFICATION_REQUIRED'; question: string; /** What we still need to know. */ missing: string[] }
  | { status: 'NO_OP'; message: string };

// ──────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ──────────────────────────────────────────────────────────────────────────────

type IntentStep = {
  actionId: ActionId;
  branding?: Partial<CanonicalBranding>;
  features?: Partial<CanonicalFeatures>;
  /** Resolved persona mode for an UPDATE_PERSONA step. */
  personaMode?: 'sales' | 'concierge';
  /** Resolved branding theme for an APPLY_BRANDING_THEME step. */
  theme?: BrandingTheme;
  preview: string;
};

/**
 * Validate a partial canonical payload. Returns the parsed object or throws a
 * ZodError — callers translate that into CLARIFICATION_REQUIRED / a mapper-level
 * validation failure. This enforces the canonical schema on every step.
 */
function validateStep(partial: unknown): CanonicalWidgetConfig {
  // The registry validates with the full schema; the mapper pre-validates so a
  // malformed plan is never proposed. `.passthrough()` allows unknown keys.
  return CanonicalWidgetConfigSchema.parse(partial) as CanonicalWidgetConfig;
}

function themeHint(draft?: StudioDraftLike): string {
  if (draft?.activeThemeName) return ` (you're currently editing the '${draft.activeThemeName}' theme)`;
  return '';
}

/**
 * Human-readable label for the current route, used to make the AI's
 * confirmation explicitly state the page it is acting on (contextual honesty).
 * Falls back to the raw path when no friendly mapping exists.
 */
function routeLabel(route?: string): string | null {
  if (!route) return null;
  const map: Record<string, string> = {
    '/client/dashboard/studio/branding': 'the Branding page',
    '/client/dashboard/studio/persona': 'the Persona page',
    '/client/dashboard/studio': 'the Studio Home page',
  };
  if (map[route]) return map[route];
  // Generic fallback: title-case the last path segment.
  const last = route.split('/').filter(Boolean).pop();
  if (!last) return null;
  return `the ${last
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')} page`;
}

// ──────────────────────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────────────────────

export interface MapIntentInput {
  /** Raw natural-language utterance from the user. */
  utterance: string;
  /** Current draft state, used for context-aware suggestions. */
  draft?: StudioDraftLike;
  /**
   * The route the user is currently on (e.g. `/client/dashboard/studio/branding`).
   * Surfaced in the confirmation preview so the AI states the context it is
   * acting on (contextual honesty).
   */
  currentRoute?: string;
}

/**
 * Translate a user utterance into a validated, multi-step plan of ActionIntents.
 *
 * This is a deterministic, rule-based mapper. In production it would sit behind
 * an LLM that emits a normalized intent object; here we parse the utterance for
 * known directives to keep the orchestration testable and side-effect free.
 */
export function mapIntentToActions(input: MapIntentInput): MapperResult {
  const text = input.utterance.toLowerCase();
  const draft = input.draft;
  const where = routeLabel(input.currentRoute);
  const steps: IntentStep[] = [];

  // ── Header / branding directives ──────────────────────────────────────────
  // Gradient takes precedence over a plain solid color (one header step).
  // Color extraction uses the original-case utterance so hex casing is preserved.
  const gradient = extractGradient(input.utterance);
  const headerColor = gradient ? null : extractColor(input.utterance, ['header', 'top', 'background']);
  if (gradient) {
    steps.push({
      actionId: 'UPDATE_WIDGET_CONFIG',
      branding: { headerConfig: { type: 'gradient', colorStart: gradient.start, colorEnd: gradient.end } },
      preview: `set your header gradient from ${gradient.start} to ${gradient.end}${themeHint(draft)}`,
    });
  } else if (headerColor) {
    steps.push({
      actionId: 'UPDATE_WIDGET_CONFIG',
      branding: { headerConfig: { type: 'solid', colorStart: headerColor } },
      preview: `change your header color to ${headerColor}${themeHint(draft)}`,
    });
  }

  // ── Features: AI insight badge / design mirror / custom css ────────────────
  if (/(ai|insight|insights)\s*(badge|indicator|toggle)/.test(text) || /enable.*(ai|insight).*badge/.test(text) || /turn on.*(ai|insight).*badge/.test(text)) {
    steps.push({
      actionId: 'UPDATE_WIDGET_CONFIG',
      features: { aiInsightBadge: true },
      preview: `activate the AI insights badge`,
    });
  }
  if (/design\s*mirror/.test(text)) {
    steps.push({
      actionId: 'UPDATE_WIDGET_CONFIG',
      features: { aiDesignMirror: true },
      preview: `enable AI design mirror suggestions`,
    });
  }
  if (/custom\s*css/.test(text)) {
    steps.push({
      actionId: 'UPDATE_WIDGET_CONFIG',
      features: { customCss: true },
      preview: `turn on custom CSS support`,
    });
  }

  // ── Branding theme directive ───────────────────────────────────────────────
  // Recognizes high-level theme requests ("make it legal", "modern theme", etc.)
  // and maps them to a pre-defined CanonicalBranding payload.
  const theme = getBrandingTheme(input.utterance);
  if (theme) {
    steps.push({
      actionId: 'APPLY_BRANDING_THEME',
      branding: theme.branding,
      preview: `apply the ${theme.label} theme`,
    });
    (steps[steps.length - 1] as IntentStep & { theme?: BrandingTheme }).theme = theme;
  }

  // ── Persona mode directive ────────────────────────────────────────────────
  // Recognizes "concierge" / "sales" mode switches, optionally prefaced by
  // "switch to", "set persona to", "use ... mode", "make it ...", etc.
  const personaMode = extractPersonaMode(input.utterance);
  if (personaMode) {
    steps.push({
      actionId: 'UPDATE_PERSONA',
      // Persona payload is validated against the registry's PersonaModeSchema,
      // not the canonical widget config — it carries { mode }.
      branding: undefined,
      preview: `switch your persona to ${personaMode} mode`,
    });
    // Tag the resolved mode so applyProposalToDraft / the dispatcher can read it.
    (steps[steps.length - 1] as IntentStep & { personaMode?: 'sales' | 'concierge' }).personaMode =
      personaMode;
  }

  // ── No recognizable directive ──────────────────────────────────────────────
  if (steps.length === 0) {
    if (/(header|footer|color|badge|theme|branding|gradient)/.test(text)) {
      return {
        status: 'CLARIFICATION_REQUIRED',
        question:
          "I'm not sure exactly what you'd like to change. Could you tell me the specific color, gradient, or feature you want to update?",
        missing: ['target_field', 'target_value'],
      };
    }
    return {
      status: 'NO_OP',
      message: "I didn't detect a configuration change in that request.",
    };
  }

  // ── Build & validate the payload for each step ──────────────────────────────
  const intents: ActionIntent[] = [];
  for (const step of steps) {
    // Persona steps carry a { mode } payload validated against PersonaModeSchema,
    // not the canonical widget config.
    if (step.actionId === 'UPDATE_PERSONA') {
      const mode = PersonaModeSchema.parse(step.personaMode);
      intents.push({
        actionId: 'UPDATE_PERSONA',
        payload: { mode } as unknown as CanonicalWidgetConfig,
        confirmationPreview: `I am about to ${step.preview}.`,
      });
      continue;
    }

    const partial: CanonicalWidgetConfig = {
      ...(step.branding ? { branding: step.branding } : {}),
      ...(step.features ? { features: step.features } : {}),
    } as CanonicalWidgetConfig;

    try {
      const validated = validateStep(partial);
      intents.push({
        actionId: step.actionId,
        payload: validated,
        confirmationPreview: `I am about to ${step.preview}.`,
      });
    } catch {
      // A malformed step should never reach here (we only emit known-good shapes),
      // but if it does we ask for clarification rather than proposing bad data.
      return {
        status: 'CLARIFICATION_REQUIRED',
        question: `I couldn't interpret one of the requested changes ("${step.preview}"). Can you rephrase it?`,
        missing: ['malformed_step'],
      };
    }
  }

  const planPreview = intents
    .map((i) => i.confirmationPreview)
    .join(' ')
    .replace(/\.$/, '') + '. Should I proceed?' + (where ? ` (on ${where})` : '');

  return {
    status: 'PLAN_READY',
    intents,
    planPreview:
      intents.length > 1
        ? `I'm about to make ${intents.length} changes on ${where ?? 'your studio'}: ${planPreview}`
        : `I'm about to ${planPreview.replace(/^I am about to /, '')}, on ${where ?? 'your studio'}. Should I proceed?`,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Utterance parsing utilities (small, dependency-free)
// ──────────────────────────────────────────────────────────────────────────────

function extractColor(rawText: string, triggers: string[]): string | null {
  const lower = rawText.toLowerCase();
  if (!triggers.some((t) => lower.includes(t))) return null;
  const match = rawText.match(/#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/);
  if (match) return match[0];
  // Named colors could be mapped here; left null to force clarification.
  return null;
}

function extractGradient(rawText: string): { start: string; end: string } | null {
  if (!/gradient/i.test(rawText)) return null;
  const colors = rawText.match(/#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g);
  if (colors && colors.length >= 2) {
    return { start: colors[0], end: colors[1] };
  }
  return null;
}

/**
 * Detect a persona-mode switch ("concierge" / "sales"). Matches the bare keyword
 * or the keyword preceded by a mode-intent phrase ("switch to", "set persona to",
 * "use ... mode", "make it ...", "change the persona to"). Returns the resolved
 * mode, or null when no persona directive is present.
 */
function extractPersonaMode(rawText: string): 'sales' | 'concierge' | null {
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
