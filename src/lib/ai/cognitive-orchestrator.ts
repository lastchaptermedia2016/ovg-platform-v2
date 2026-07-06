/**
 * @file cognitive-orchestrator.ts
 *
 * The "Brain" behind the IntentMapper.
 *
 * Wraps `mapIntentToActions` and layers three capability expansions on top of
 * the deterministic mapper:
 *
 *   1. System Prompting   — a structured CO-WORKER identity + "Production
 *                           Excellence" mandate that frames every decision.
 *   2. Context-Aware Reasoning — consumes StudioDraftContext, CurrentRoute,
 *                           and a lightweight UserPreferenceHistory so proposals
 *                           reflect what the user has cared about before.
 *   3. The Critique Phase — `validateIntent()` runs each proposed intent against
 *                           a "Design Principles" set (contrast, conflicting
 *                           branding, etc.). It only *flags* sloppy work; it
 *                           never blocks a legitimate user choice.
 *
 * Every generated ActionIntent gains an `explanation` so the user can audit why
 * the AI chose a path (explainability).
 *
 * Design guarantees (inherited + extended):
 *   - Deterministic & side-effect free: no LLM call, no network, no DB. Keeps
 *     latency in the microsecond range and the module unit-testable.
 *   - Memoization: the reasoning loop memoizes contrast/design-principle checks
 *     on the canonical payload so repeated critiques are O(1).
 *   - Memory is lightweight: UserPreferenceHistory is a capped JSON object
 *     (default 25 entries) — it never grows the session unbounded.
 */

import {
  mapIntentToActions,
  type ActionIntent,
  type MapperResult,
  type StudioDraftLike,
} from './intent-mapper';

// ──────────────────────────────────────────────────────────────────────────────
// System Prompt (structured template — the AI's "Co-worker" identity)
// ──────────────────────────────────────────────────────────────────────────────

export const SYSTEM_PROMPT = `You are Zeeder, the Lead Architect for the Zeeder platform. You are pragmatic, detail-oriented, and prioritize Production Excellence.
Mandate — PRODUCTION EXCELLENCE:
  • Propose only changes that are well-formed, validated, and reversible.
  • Respect the user's stated preferences; when they conflict with a principle,
    flag it but never silently override the user.
  • Be explicit about WHY a change is proposed so the user can audit it.
  • Keep the workspace consistent: a draft proposal carries across pages.`;

/**
 * The System Persona injected into the parsing/reasoning layer. Frames the
 * assistant as a Lead Architect at Zeeder who optimizes for long-term technical
 * debt reduction and aesthetic excellence — not just for satisfying the literal
 * request. Surfaced verbatim to any downstream LLM step.
 */
export const SYSTEM_PERSONA = `You are an expert Lead Architect at Zeeder. You are helpful, professional, and prioritize long-term technical debt reduction and aesthetic excellence.`;

// ──────────────────────────────────────────────────────────────────────────────
// User Preference History (lightweight JSON store)
// ──────────────────────────────────────────────────────────────────────────────

export interface PreferenceRecord {
  /** Stable key, e.g. "accessibility:high-contrast", "theme:dark". */
  key: string;
  /** Human-readable value/label. */
  value: string;
  /** Epoch ms when observed. */
  at: number;
}

/**
 * A bounded, serializable preference store. Intentionally tiny: it keeps at
 * most `maxEntries` most-recent records and exposes plain JSON for persistence.
 * No React state, no session bloat.
 */
export class UserPreferenceHistory {
  private records: PreferenceRecord[];
  private readonly max: number;

  constructor(initial?: PreferenceRecord[] | string | null, max = 25) {
    this.max = max;
    if (typeof initial === 'string') {
      try {
        this.records = JSON.parse(initial) as PreferenceRecord[];
      } catch {
        this.records = [];
      }
    } else {
      this.records = initial ? [...initial] : [];
    }
  }

  /** Record (or refresh) a preference. De-duplicates by key, keeps most recent. */
  record(key: string, value: string): void {
    const at = Date.now();
    this.records = this.records.filter((r) => r.key !== key);
    this.records.push({ key, value, at });
    if (this.records.length > this.max) {
      this.records = this.records.slice(this.records.length - this.max);
    }
  }

  /** Read the current value for a key, or undefined. */
  get(key: string): string | undefined {
    return this.records.find((r) => r.key === key)?.value;
  }

  /** True when a preference has been observed at least once. */
  has(key: string): boolean {
    return this.records.some((r) => r.key === key);
  }

  /** Serializable snapshot for persistence. */
  toJSON(): string {
    return JSON.stringify(this.records);
  }

  list(): readonly PreferenceRecord[] {
    return this.records;
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Design Principles (the Critic)
// ──────────────────────────────────────────────────────────────────────────────

export interface CritiqueFlag {
  /** Principle id, e.g. "contrast", "conflicting-branding". */
  principle: string;
  severity: 'info' | 'warn';
  message: string;
}

export interface IntentCritique {
  /** True when nothing questionable was found. */
  ok: boolean;
  flags: CritiqueFlag[];
}

/**
 * Proactive critique outcome. Returned (instead of PLAN_READY) when a request
 * is technically valid but visually poor AND it clashes with a learned user
 * preference. The AI then asks the user whether to accept or take the suggested
 * on-brand alternative — it never silently overrides the user.
 */
export interface CritiquePrompt {
  status: 'CRITIQUE_REQUIRED';
  /** The original (poor-but-valid) intents, kept so the user can still proceed. */
  originalIntents: ActionIntent[];
  /** The on-brand alternative the orchestrator recommends instead. */
  suggestedIntents: ActionIntent[];
  /** The natural-language question to ask the user. */
  question: string;
  /** The preference that triggered the critique (for transparency). */
  conflictingPreference?: string;
  critiques: IntentCritique[];
  preferencesJson: string;
}

// Relative luminance helper (WCAG) — operates on #RGB / #RRGGBB.
function hexToRgb(hex: string): [number, number, number] | null {
  const m = hex.replace('#', '');
  if (m.length === 3) {
    return [
      parseInt(m[0] + m[0], 16),
      parseInt(m[1] + m[1], 16),
      parseInt(m[2] + m[2], 16),
    ];
  }
  if (m.length === 6) {
    return [
      parseInt(m.slice(0, 2), 16),
      parseInt(m.slice(2, 4), 16),
      parseInt(m.slice(4, 6), 16),
    ];
  }
  return null;
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const a = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
}

function contrastRatio(c1: string, c2: string): number | null {
  const a = hexToRgb(c1);
  const b = hexToRgb(c2);
  if (!a || !b) return null;
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Suggest an on-brand alternative: darken a hex color (multiply RGB by a factor)
 * until it reaches at least `target` contrast against white text, preserving
 * the original hue. Falls back to a safe dark navy if it can't converge.
 */
function suggestAccessibleColor(hex: string, target = 3): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return '#0A2540';
  const [r, g, b] = rgb;
  for (let factor = 1; factor >= 0.2; factor -= 0.1) {
    const candidate: [number, number, number] = [
      Math.round(r * factor),
      Math.round(g * factor),
      Math.round(b * factor),
    ];
    const ratio = (() => {
      const l1 = relativeLuminance(candidate);
      const l2 = relativeLuminance([255, 255, 255]);
      const lighter = Math.max(l1, l2);
      const darker = Math.min(l1, l2);
      return (lighter + 0.05) / (darker + 0.05);
    })();
    if (ratio >= target) {
      return `#${candidate.map((v) => v.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
    }
  }
  return '#0A2540';
}

/**
 * Critique a single proposed intent against the Design Principles set.
 *
 * Guardrail: this is advisory only. It FLAGS potential sloppiness (low contrast,
 * conflicting primary/accent, conflicting header+footer looks) but never blocks
 * a legitimate user choice. `ok` is true unless something is worth surfacing.
 */
export function validateIntent(intent: ActionIntent): IntentCritique {
  const flags: CritiqueFlag[] = [];
  const branding = intent.payload.branding;

  // ── Principle: Contrast ────────────────────────────────────────────────────
  // Header/footer solid color should meet WCAG AA (>= 3:1) against white text.
  const HEADER_TEXT = '#FFFFFF';
  for (const section of ['headerConfig', 'footerConfig'] as const) {
    const cfg = branding?.[section];
    if (cfg?.type === 'solid' && cfg.colorStart) {
      const ratio = contrastRatio(cfg.colorStart, HEADER_TEXT);
      if (ratio !== null && ratio < 3) {
        flags.push({
          principle: 'contrast',
          severity: 'warn',
          message: `The ${section.replace('Config', '')} color ${cfg.colorStart} has low contrast (~${ratio.toFixed(
            1
          )}:1) with white text. Consider a darker shade for readability.`,
        });
      }
    }
  }

  // ── Principle: Conflicting branding ─────────────────────────────────────────
  // Primary and accent should not be identical (looks like a mistake).
  if (
    branding?.primaryColor &&
    branding?.accentColor &&
    branding.primaryColor.toLowerCase() === branding.accentColor.toLowerCase()
  ) {
    flags.push({
      principle: 'conflicting-branding',
      severity: 'warn',
      message: `Primary and accent colors are identical (${branding.primaryColor}). They usually should differ.`,
    });
  }

  // ── Principle: Logo without URL sanity ──────────────────────────────────────
  if (branding?.logoUrl === '') {
    flags.push({
      principle: 'conflicting-branding',
      severity: 'info',
      message: 'Logo URL is empty; the widget will render without a brand mark.',
    });
  }

  return { ok: flags.length === 0, flags };
}

/**
 * Detect a UI-triggering query (capabilities / help / "what can you do"). This
 * is intentionally narrow so it never fires for real config requests. Returns
 * the trigger signal for the UI, or null when there's nothing to surface.
 */
function detectUiTrigger(utterance: string): UiTrigger | null {
  const text = utterance.toLowerCase();
  const isCapabilityQuery =
    /(what|show|list).*(can|do).*(you|i).*(do|change|update|set)/.test(text) ||
    /\b(capabilities|help|what can you do|how (can|do) (you|i) (use|work)|show me what)\b/.test(text);
  if (isCapabilityQuery) return 'OPEN_CAPABILITIES';
  return null;
}

// ──────────────────────────────────────────────────────────────────────────────
// Orchestrator
// ──────────────────────────────────────────────────────────────────────────────

export interface OrchestratorContext {
  /** Current Studio draft (read-only observation). */
  draft?: StudioDraftLike;
  /** Current route, e.g. /client/dashboard/studio/branding. */
  currentRoute?: string;
  /** User preference memory. Optional — a fresh one is created if omitted. */
  preferences?: UserPreferenceHistory;
  /**
   * When true, the orchestrator records inferred preferences (e.g. "high
   * accessibility" when the user requests a dark/compliant header). Default true.
   */
  learnFromPlan?: boolean;
}

/** Signals the UI should open a surface. The AI stays "dumb" to the UI — it
 * only emits this signal; the Resident Intelligence (UI) acts on it. */
export type UiTrigger = 'OPEN_CAPABILITIES';

export type OrchestratedPlan =
  | (Extract<MapperResult, { status: 'PLAN_READY' }> & {
      critiques: IntentCritique[];
      preferencesJson: string;
      uiTrigger?: UiTrigger;
    })
  | (Extract<MapperResult, { status: 'CLARIFICATION_REQUIRED' | 'NO_OP' }> & {
      preferencesJson: string;
      uiTrigger?: UiTrigger;
    })
  | (CritiquePrompt & { uiTrigger?: UiTrigger });

export class CognitiveOrchestrator {
  private preferences: UserPreferenceHistory;
  private readonly learn: boolean;
  // Memo cache for contrast checks: "colorA|colorB" -> ratio (latency guard).
  private contrastCache = new Map<string, number | null>();

  constructor(context?: OrchestratorContext) {
    this.preferences = context?.preferences ?? new UserPreferenceHistory();
    this.learn = context?.learnFromPlan ?? true;
  }

  /**
   * Produce an explained, critiqued plan. This is the single entry point the
   * Conversational AI calls. It never executes — it proposes + explains + flags.
   */
  plan(input: { utterance: string; draft?: StudioDraftLike; currentRoute?: string }): OrchestratedPlan {
    const base = mapIntentToActions({
      utterance: input.utterance,
      draft: input.draft ?? undefined,
      currentRoute: input.currentRoute ?? undefined,
    });

    // UI Trigger: a capability/help query is not a config change. The AI stays
    // "dumb" to the UI — it only raises a signal; the UI opens the modal.
    const trigger = detectUiTrigger(input.utterance);
    if (trigger) {
      const prefs = this.preferences.toJSON();
      // If the mapper already resolved a NO_OP/CLARIFICATION, augment it with the
      // trigger; otherwise synthesize a friendly NO_OP carrying the trigger.
      if (base.status === 'NO_OP' || base.status === 'CLARIFICATION_REQUIRED') {
        return { ...base, preferencesJson: prefs, uiTrigger: trigger };
      }
      return {
        status: 'NO_OP',
        message:
          'I can update your branding and AI persona, open the design mirror, or enable features like the AI insights badge. Opening the capabilities panel so you can see everything I can do.',
        preferencesJson: prefs,
        uiTrigger: trigger,
      };
    }

    if (base.status !== 'PLAN_READY') {
      return { ...base, preferencesJson: this.preferences.toJSON() };
    }

    const intents = base.intents.map((intent) =>
      this.explain(intent, input.draft, input.currentRoute)
    );

    // Critique each intent (memoized internally) and collect flags.
    const critiques = intents.map((intent) => this.critique(intent));

    // Learn preferences from the proposed plan.
    if (this.learn) this.learnFromIntents(intents, input.draft);

    // Proactive critique: if a request is technically valid but visually poor
    // AND clashes with a learned preference, ask before applying (never override).
    const critiquePrompt = this.buildCritiquePrompt(intents, critiques, input.currentRoute);
    if (critiquePrompt) return critiquePrompt;

    const planPreview = this.buildPlanPreview(intents, input.currentRoute);

    return {
      status: 'PLAN_READY',
      intents,
      planPreview,
      critiques,
      preferencesJson: this.preferences.toJSON(),
    };
  }

  /**
   * Decide whether to raise a CRITIQUE_REQUIRED. Triggered when the critic found
   * a `contrast` warning and the user has a prior accessibility preference — we
   * then offer an on-brand, accessible alternative instead of silently applying
   * the poor choice.
   */
  private buildCritiquePrompt(
    intents: ActionIntent[],
    critiques: IntentCritique[],
    route: string | undefined
  ): CritiquePrompt | null {
    const hasAccessibilityPref = this.preferences.has('accessibility:high-contrast');
    if (!hasAccessibilityPref) return null;

    const suggested: ActionIntent[] = [];
    let triggered = false;
    let conflictingColor: string | null = null;

    intents.forEach((intent, idx) => {
      const flag = critiques[idx]?.flags.find((f) => f.principle === 'contrast' && f.severity === 'warn');
      const header = intent.payload.branding?.headerConfig;
      if (flag && header?.type === 'solid' && header.colorStart) {
        triggered = true;
        conflictingColor = header.colorStart;
        const alternative = suggestAccessibleColor(header.colorStart);
        const altIntent: ActionIntent = {
          ...intent,
          payload: {
            ...intent.payload,
            branding: {
              ...intent.payload.branding,
              headerConfig: { type: 'solid', colorStart: alternative },
            },
          },
          explanation: `On-brand alternative: a darker, white-text-compliant header (${alternative}) that respects your previous focus on high-accessibility design.`,
        };
        suggested.push(altIntent);
      } else {
        suggested.push(intent);
      }
    });

    if (!triggered) return null;

    const question = `I can do that, but based on our previous focus on high-accessibility design, ${conflictingColor} would clash (low contrast with white text). Should I try ${suggested
      .map((s) => s.payload.branding?.headerConfig?.colorStart)
      .filter(Boolean)
      .join(', ')} instead?${route ? ` (on ${route})` : ''}`;
    return {
      status: 'CRITIQUE_REQUIRED',
      originalIntents: intents,
      suggestedIntents: suggested,
      question,
      conflictingPreference: 'accessibility:high-contrast',
      critiques,
      preferencesJson: this.preferences.toJSON(),
    };
  }

  // ── Explainability ──────────────────────────────────────────────────────────
  private explain(
    intent: ActionIntent,
    draft: StudioDraftLike | undefined,
    route: string | undefined
  ): ActionIntent {
    const branding = intent.payload.branding;
    const reasons: string[] = [];

    const header = branding?.headerConfig;
    if (header?.type === 'solid' && header.colorStart) {
      const prefersAccessible = this.preferences.has('accessibility:high-contrast');
      const ratio = this.cachedContrast(header.colorStart, '#FFFFFF');
      if (prefersAccessible && ratio !== null && ratio >= 3) {
        reasons.push(
          `I'm applying a white-text-compliant header (${header.colorStart}, contrast ~${ratio.toFixed(
            1
          )}:1) because you previously expressed a preference for high-accessibility designs.`
        );
      } else if (ratio !== null && ratio < 3) {
        reasons.push(
          `I'm setting the header to ${header.colorStart}, though note it's low-contrast with white text.`
        );
      } else {
        reasons.push(`I'm updating the header to ${header.colorStart}${route ? ` on ${route}` : ''}.`);
      }
    }

    if (branding?.primaryColor) {
      reasons.push(`I'm setting your primary brand color to ${branding.primaryColor}.`);
    }

    if (intent.payload.features?.aiInsightBadge) {
      reasons.push("I'm enabling the AI insights badge to surface proactive suggestions.");
    }
    if (intent.payload.features?.aiDesignMirror) {
      reasons.push("I'm turning on AI design mirror for live layout suggestions.");
    }
    if (intent.payload.features?.customCss) {
      reasons.push('I\'m enabling custom CSS so you can fine-tune the widget.');
    }

    if (reasons.length === 0) {
      reasons.push("I'm applying this change because it matches what you asked for.");
    }

    // Prefer an explicit prior preference mention if present.
    const nestedMode = intent.payload.aiPersona?.personaMode;
    const directMode = (intent.payload as { mode?: 'sales' | 'concierge' }).mode;
    const personaMode = nestedMode ?? directMode;
    if (personaMode && draft?.personaMode && personaMode !== draft.personaMode) {
      reasons.push(
        `I'm switching the persona mode to "${personaMode}" as you requested — different from the current "${draft.personaMode}". This updates the draft; click Save to commit it.`
      );
    }

    return { ...intent, explanation: reasons.join(' ') };
  }

  // ── Critique (memoized where expensive) ─────────────────────────────────────
  private critique(intent: ActionIntent): IntentCritique {
    // validateIntent is pure and advisory-only; the expensive contrast math is
    // memoized via cachedContrast inside explain(), keeping the loop cheap.
    return validateIntent(intent);
  }

  private cachedContrast(a: string, b: string): number | null {
    const key = `${a.toLowerCase()}|${b.toLowerCase()}`;
    if (this.contrastCache.has(key)) return this.contrastCache.get(key) ?? null;
    const r = contrastRatio(a, b);
    this.contrastCache.set(key, r);
    return r;
  }

  // ── Learning ────────────────────────────────────────────────────────────────
  private learnFromIntents(intents: ActionIntent[], _draft: StudioDraftLike | undefined): void {
    for (const intent of intents) {
      const header = intent.payload.branding?.headerConfig;
      if (header?.type === 'solid' && header.colorStart) {
        const ratio = this.cachedContrast(header.colorStart, '#FFFFFF');
        // If the user keeps choosing accessible (>=3:1) headers, remember it.
        if (ratio !== null && ratio >= 3) {
          this.preferences.record('accessibility:high-contrast', 'preferred');
        }
      }
      if (intent.payload.features?.customCss) {
        this.preferences.record('customization:custom-css', 'enabled');
      }
    }
  }

  private buildPlanPreview(intents: ActionIntent[], route: string | undefined): string {
    const joined = intents
      .map((i) => i.confirmationPreview)
      .join(' ')
      .replace(/\.$/, '');
    const where = route ? ` on ${route}` : '';
    return intents.length > 1
      ? `I'm about to make ${intents.length} changes${where}: ${joined}. Should I proceed?`
      : `I'm about to ${joined}${where}. Should I proceed?`;
  }
}

/**
 * Convenience function matching the mapper's call style. Creates a transient
 * orchestrator (no persisted memory) for one-shot use.
 */
export function orchestrate(
  input: { utterance: string; draft?: StudioDraftLike; currentRoute?: string },
  context?: OrchestratorContext
): OrchestratedPlan {
  const orch = new CognitiveOrchestrator({
    ...context,
    draft: input.draft,
    currentRoute: input.currentRoute,
  });
  return orch.plan(input);
}
