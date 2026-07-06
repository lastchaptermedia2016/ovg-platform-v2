'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useStudioDraft } from '@/contexts/StudioDraftContext';
import { type MapperResult, type ActionIntent } from '@/lib/ai/intent-mapper';
import {
  CognitiveOrchestrator,
  UserPreferenceHistory,
  type CritiquePrompt,
  type OrchestratedPlan,
  type UiTrigger,
} from '@/lib/ai/cognitive-orchestrator';
import {
  dispatchAction,
  describeOutcome,
  type ActionOutcome,
} from '@/lib/actions/registry';
import {
  AuthMiddleware,
  createSupabaseAuthDbClient,
  type AuthContext,
  type AuthDbClient,
} from '@/lib/actions/auth-middleware';

// ──────────────────────────────────────────────────────────────────────────────
// Options
// ──────────────────────────────────────────────────────────────────────────────

export interface UseAgenticColleagueOptions {
  /**
   * Identity + tenancy context required by AuthMiddleware. Resolved by the
   * caller (e.g. from the session) — the hook never reads auth itself.
   */
  authContext: AuthContext;
  /**
   * Supabase client used to build the AuthDbClient dependency. The hook only
   * constructs the dependency; it performs no queries directly, preserving the
   * separation of concerns established by the registry.
   */
  supabase: SupabaseClient;
  /** Optional override for the DB dependency (used in tests / isolation). */
  authDb?: AuthDbClient;
  /**
   * Pre-built CognitiveOrchestrator instance. When supplied (e.g. by
   * VoiceProvider for session-lifetime memory), the hook uses it directly so
   * UserPreferenceHistory persists across utterances. Falls back to a transient
   * orchestrator when omitted.
   */
  orchestrator?: CognitiveOrchestrator;
  /** When false, audio feedback is suppressed (e.g. for headless/tests). */
  enableAudio?: boolean;
}

// ──────────────────────────────────────────────────────────────────────────────
// Return shape
// ──────────────────────────────────────────────────────────────────────────────

export interface AgenticColleagueState {
  /** True while parsing intent or committing to the database. */
  isProcessing: boolean;
  /** The last plan returned by the IntentMapper (null until first utterance). */
  lastPlan: MapperResult | null;
  /** The proposed intents awaiting voice-confirm. */
  pendingIntents: ActionIntent[];
  /** The combined spoken confirmation preview for the current plan. */
  confirmationText: string | null;
  /** A clarification question when intent was ambiguous. */
  clarification: string | null;
  /**
   * Active proactive critique (technically-valid but visually-poor request that
   * clashes with a learned preference). Null unless CRITIQUE_REQUIRED was raised.
   */
  critique: CritiquePrompt | null;
  /**
   * A UI signal raised by the orchestrator (e.g. 'OPEN_CAPABILITIES'). The AI
   * stays "dumb" to the UI — it only emits this; the UI acts on it. Null when
   * there is no pending trigger.
   */
  uiTrigger: UiTrigger | null;
  /** The most recent ActionOutcome after a commit attempt. */
  lastOutcome: ActionOutcome | null;
  /** The last spoken (or to-be-spoken) audio message. */
  lastSpoken: string | null;
  /** Any unexpected error string for display. */
  error: string | null;
}

export interface UseAgenticColleagueReturn extends AgenticColleagueState {
  /** Parse a user utterance, propose changes to the draft, and speak the preview. */
  processUtterance: (text: string, currentRoute?: string) => Promise<void>;
  /** Execute dispatchAction for the currently pending intents (voice-confirmed). */
  commitChanges: () => Promise<void>;
  /**
   * Resolve an active critique: when `useSuggested` is true the on-brand
   * alternative intents are applied, otherwise the original (poor-but-valid)
   * intents proceed. No-op when there is no active critique.
   */
  acceptCritique: (useSuggested: boolean) => void;
  /** Cancel any in-progress speech synthesis (interrupt). */
  interrupt: () => void;
}

// ──────────────────────────────────────────────────────────────────────────────
// Audio feedback (SpeechSynthesis wrapper)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Strip internal command tags (e.g. "[ACTION:OPEN_CAPABILITIES]") from text
 * before it reaches the user's ears. The AI may embed these for the UI, but the
 * user should only hear the helpful, natural-language response.
 */
function stripActionTags(text: string): string {
  return text.replace(/\[ACTION:[^\]]*\]/gi, '').replace(/\s{2,}/g, ' ').trim();
}

function speak(text: string, enabled: boolean): void {
  if (!enabled || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  try {
    const utter = new SpeechSynthesisUtterance(stripActionTags(text));
    window.speechSynthesis.cancel(); // interrupt anything already playing
    window.speechSynthesis.speak(utter);
  } catch {
    // Speech synthesis unsupported — fail silently; UI still shows the text.
  }
}

/**
 * Build the audio "advisory" note for any warn-severity critique flags. Returns
 * null when there are none. When `withProceed` is true it ends with the
 * "Should I proceed anyway?" prompt (used for the proactive-critique branch).
 */
function buildWarnNote(
  critiques: { ok: boolean; flags: { principle: string; severity: 'info' | 'warn'; message: string }[] }[] | undefined,
  withProceed = false
): string | null {
  const warns = (critiques ?? [])
    .flatMap((c) => c.flags)
    .filter((f) => f.severity === 'warn')
    .map((f) => f.message);
  if (warns.length === 0) return null;
  const joined = warns.join(' ');
  return withProceed
    ? `One quick note before we apply this: ${joined}. Should I proceed anyway?`
    : `One quick note before we apply this: ${joined}.`;
}

// ──────────────────────────────────────────────────────────────────────────────
// Hook
// ──────────────────────────────────────────────────────────────────────────────

export function useAgenticColleague(options: UseAgenticColleagueOptions): UseAgenticColleagueReturn {
  const { authContext, supabase, authDb, orchestrator: injectedOrchestrator, enableAudio = true } = options;
  const { draft, setDraft } = useStudioDraft();

  // The reasoning "Brain" — stateful across utterances so it accumulates user
  // preference memory (lightweight, in-memory JSON store). Prefer an orchestrator
  // owned by the caller (e.g. VoiceProvider) so memory persists for the session;
  // otherwise create a transient one here.
  const orchestrator = useMemo(
    () => injectedOrchestrator ?? new CognitiveOrchestrator({ preferences: new UserPreferenceHistory() }),
    [injectedOrchestrator]
  );

  const [state, setState] = useState<AgenticColleagueState>({
    isProcessing: false,
    lastPlan: null,
    pendingIntents: [],
    confirmationText: null,
    clarification: null,
    critique: null,
    uiTrigger: null,
    lastOutcome: null,
    lastSpoken: null,
    error: null,
  });

  // Keep the latest draft available inside async callbacks without re-binding.
  const draftRef = useRef(draft);
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  // Keep the latest pending intents available to commitChanges without re-binding.
  const pendingRef = useRef<ActionIntent[]>(state.pendingIntents);
  useEffect(() => {
    pendingRef.current = state.pendingIntents;
  }, [state.pendingIntents]);

  const setPartial = useCallback(
    (patch: Partial<AgenticColleagueState> | ((prev: AgenticColleagueState) => Partial<AgenticColleagueState>)) => {
      setState((prev) => ({ ...prev, ...(typeof patch === 'function' ? patch(prev) : patch) }));
    },
    []
  );

  /** Map a proposed canonical branding update onto the StudioDraft (proposed UI state). */
  const applyProposalToDraft = useCallback((intents: ActionIntent[]) => {
    setDraft((current) => {
      const next = { ...current };
      for (const intent of intents) {
        const branding = intent.payload.branding;
        const headerType = branding?.headerConfig?.type;
        if (headerType && headerType !== 'none') {
          // StudioDraft only models solid/image; map canonical 'gradient' to solid.
          const mapped = headerType === 'gradient' ? 'solid' : headerType;
          next.header = {
            type: mapped,
            image: branding.headerConfig?.image ?? undefined,
            colorStart: branding.headerConfig?.colorStart ?? undefined,
          };
        }
        const footerType = branding?.footerConfig?.type;
        if (footerType && footerType !== 'none') {
          const mappedF = footerType === 'gradient' ? 'solid' : footerType;
          next.footer = {
            type: mappedF,
            image: branding.footerConfig?.image ?? undefined,
            colorStart: branding.footerConfig?.colorStart ?? undefined,
          };
        }
        if (branding?.primaryColor) next.primaryColor = branding.primaryColor;
        if (branding?.logoUrl) next.logoUrl = branding.logoUrl;
        if (branding?.widgetPosition) next.widgetPosition = branding.widgetPosition;
        const ai = intent.payload.aiPersona;
        if (ai?.systemPrompt) next.systemPrompt = ai.systemPrompt;
        if (typeof ai?.temperature === 'number') next.temperature = ai.temperature;
        if (ai?.voiceId) next.voiceId = ai.voiceId;
        if (ai?.personaMode) next.personaMode = ai.personaMode;
        // UPDATE_PERSONA intents carry { mode } directly (not nested in aiPersona).
        const personaMode = (intent.payload as { mode?: 'sales' | 'concierge' }).mode;
        if (personaMode) next.personaMode = personaMode;
      }
      return next;
    });
  }, [setDraft]);

  const processUtterance = useCallback(async (text: string, currentRoute?: string) => {
    setPartial({ isProcessing: true, error: null, critique: null });
    try {
      // Reasoning Pass: the CognitiveOrchestrator runs contextual analysis,
      // production-excellence checks, explanation generation, and proactive
      // critique before any intent is finalized.
      const orch = orchestrator;
      const plan: OrchestratedPlan = orch.plan({
        utterance: text,
        draft: draftRef.current as never,
        currentRoute,
      });
      setPartial({ lastPlan: plan as MapperResult });

      if (plan.status === 'PLAN_READY') {
        applyProposalToDraft(plan.intents);
        // Surface explanations (why the AI chose this path) in the confirmation,
        // optionally prefixed by a warn-severity critique note.
        const explanations = plan.intents.map((i) => i.explanation ?? i.confirmationPreview);
        const warnNote = buildWarnNote(plan.critiques);
        const confirmation =
          explanations.join(' ') + (warnNote ? ` ${warnNote}` : '') + ' Shall I proceed?';
        setPartial({
          pendingIntents: plan.intents,
          confirmationText: confirmation,
          clarification: null,
          lastSpoken: confirmation,
        });
        speak(confirmation, enableAudio);
      } else if (plan.status === 'CLARIFICATION_REQUIRED') {
        setPartial({
          pendingIntents: [],
          confirmationText: null,
          clarification: plan.question,
          uiTrigger: plan.uiTrigger ?? null,
          lastSpoken: plan.question,
        });
        speak(plan.question, enableAudio);
      } else if (plan.status === 'CRITIQUE_REQUIRED') {
        // Technically valid but visually poor + clashes with a learned pref.
        // Surface the critique; do NOT mutate the draft until the user chooses.
        // The question already embeds the proactive alternative; we also prefix a
        // warn-style note so the audio is explicit.
        const warnNote = buildWarnNote(plan.critiques, true);
        const confirmation = warnNote ? `${warnNote} ${plan.question}` : plan.question;
        setPartial({
          pendingIntents: [],
          confirmationText: null,
          clarification: null,
          critique: plan,
          uiTrigger: plan.uiTrigger ?? null,
          lastSpoken: confirmation,
        });
        speak(confirmation, enableAudio);
      } else {
        // NO_OP
        setPartial({
          pendingIntents: [],
          confirmationText: null,
          clarification: null,
          uiTrigger: plan.uiTrigger ?? null,
          lastSpoken: plan.message,
        });
        speak(plan.message, enableAudio);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to understand that request.';
      setPartial({ error: message, pendingIntents: [], confirmationText: null });
      speak(message, enableAudio);
    } finally {
      setPartial({ isProcessing: false });
    }
  }, [applyProposalToDraft, enableAudio, orchestrator, setPartial]);

  const commitChanges = useCallback(async () => {
    const intents = pendingRef.current;
    if (intents.length === 0) {
      setPartial({ error: 'No pending changes to commit.' });
      return;
    }

    setPartial({ isProcessing: true, error: null });
    const db = authDb ?? createSupabaseAuthDbClient(supabase);
    const dep = { enforce: AuthMiddleware.enforce, authDb: db };

    let overall: ActionOutcome | null = null;
    for (const intent of intents) {
      const outcome = await dispatchAction(intent.actionId, intent.payload, authContext, dep);
      overall = outcome;
      if (!outcome.ok) break; // stop on first failure; surface the error
    }

    if (overall) {
      setPartial({ lastOutcome: overall });
      const message = describeOutcome(overall);
      setPartial({ lastSpoken: message });
      speak(message, enableAudio);
      if (overall.ok) {
        // Clear pending once committed successfully.
        setPartial({ pendingIntents: [], confirmationText: null, critique: null });
      }
    }

    setPartial({ isProcessing: false });
  }, [authContext, authDb, enableAudio, setPartial, supabase]);

  /**
   * Resolve an active critique. Applies the suggested (on-brand) intents when
   * `useSuggested` is true, otherwise the original request. Either way the
   * proposal is written to the draft and queued for voice-confirm — the user is
   * never overridden without an explicit choice.
   */
  const acceptCritique = useCallback((useSuggested: boolean) => {
    setPartial((prev) => {
      const critique = prev.critique;
      if (!critique) return prev;
      const chosen = useSuggested ? critique.suggestedIntents : critique.originalIntents;
      applyProposalToDraft(chosen);
      return {
        ...prev,
        critique: null,
        pendingIntents: chosen,
        clarification: null,
        confirmationText: `Applying ${useSuggested ? 'the on-brand alternative' : 'your original request'}.`,
      };
    });
  }, [applyProposalToDraft, setPartial]);

  const interrupt = useCallback(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setPartial({ lastSpoken: null });
  }, [setPartial]);

  return {
    ...state,
    processUtterance,
    commitChanges,
    acceptCritique,
    interrupt,
  };
}
