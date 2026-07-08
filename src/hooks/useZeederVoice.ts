/**
 * @file useZeederVoice.ts
 *
 * ZEEDER Voice-Action Bridge Hook (Groq-Powered)
 *
 * Connects the ZEEDER client-side state machine (`ZeederContext`) with the
 * Groq-powered `/api/ai/process-command` endpoint. When a user speaks a
 * command, `handleVoiceCommand` sends it to the AI endpoint which uses
 * `llama-3.3-70b-versatile` to resolve the intent, then maps the response
 * `actionType` to a `ZeederActionId` and calls `ZeederContext.dispatch()`.
 *
 * @remarks
 * This hook is intentionally **zero-dependency** with respect to the
 * reseller domain. It does NOT import from:
 * - `src/contexts/HannahContext`
 * - `src/hooks/use-voice-command`
 * - `src/lib/reseller/*`
 *
 * @example
 * ```tsx
 * const { handleVoiceCommand, isProcessing } = useZeederVoice();
 *
 * const onUserSpeech = async (transcript: string) => {
 *   await handleVoiceCommand(transcript);
 * };
 * ```
 */

'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { isInvalidSlug } from '@/lib/utils/guard';
import { useZeeder, type ZeederClientProfile } from '@/contexts/ZeederContext';
import { useStudioDraft } from '@/contexts/StudioDraftContext';
import { isZeederActionId, type ZeederActionId } from '@/lib/zeeder/action-registry';

// ──────────────────────────── Types ─────────────────────────────────────

/** Internal state for the voice bridge. */
interface ZeederVoiceState {
  /** Whether a command is currently being processed (API + dispatch). */
  isProcessing: boolean;
  /** The last error message, or null if no error. */
  error: string | null;
}

/**
 * Map from `/api/ai/process-command` `actionType` values to ZEEDER action IDs.
 *
 * Entries not in this map (e.g. `SYSTEM_HELP`, `NO_MATCH`, `SINGLE`, `BULK`)
 * are treated as conversational/successful responses that don't trigger a
 * ZEEDER dispatch — they just log and reset state without error.
 */
const ACTION_TYPE_TO_ZEEDER_ID: Record<string, ZeederActionId | null> = {
  SYSTEM_UPDATE_BRANDING: 'updateBranding',
  SYSTEM_TELEMETRY: 'fetchTelemetry',
};

type CommandIntent = 'list_capabilities' | 'view_status' | 'get_help' | 'show_analytics';

/**
 * Map from `/api/ai/process-command` `actionType` values to CommandModal intent keys.
 *
 * This decouples AI action taxonomy from UI intent constants, allowing the AI
 * to evolve independently. Unknown actionTypes fall back to a safe default.
 */
const ACTION_TYPE_TO_INTENT = new Map<string, CommandIntent | null>([
  ['SYSTEM_HELP', 'list_capabilities'],
  ['SYSTEM_EXPLAIN', 'list_capabilities'],
  ['NO_MATCH', 'get_help'],
  ['SYSTEM_NOTE', null],
  ['SYSTEM_DISARM', null],
]);

/**
 * Default intent for unrecognized actionTypes that still warrant a modal response.
 */
const DEFAULT_UNKNOWN_INTENT: CommandIntent | null = 'get_help';

interface UseZeederVoiceOptions {
  /** Explicit reseller slug (e.g. "lastchaptermedia2016"). */
  resellerId?: string;
  tenantContext?: {
    tenantId?: string;
    category?: string;
  };
  currentConfig?: Record<string, unknown>;
  contextCapabilities?: Record<string, unknown>;
  conversationHistory?: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
  }>;
  agentMode?: 'conversational' | 'executor';
}

// ──────────────────────────── Helpers ────────────────────────────────────

async function pollForProfile(
  ref: React.RefObject<ZeederClientProfile | null>,
  timeoutMs: number
): Promise<ZeederClientProfile | null> {
  const intervalMs = 150;
  let waited = 0;
  while (waited < timeoutMs) {
    if (ref.current?.resellerSlug) return ref.current;
    await new Promise(resolve => setTimeout(resolve, intervalMs));
    waited += intervalMs;
  }
  return ref.current;
}

// ──────────────────────────── Hook ──────────────────────────────────────

/**
 * useZeederVoice
 *
 * Sovereign voice-to-action bridge for the ZEEDER system.
 *
 * Mirrors the `/reseller` `useVoiceCommand` configuration:
 * - Authenticated via `resellerId` (reseller slug), resolved server-side
 *   by `resolveResellerId`.
 * - Payload sent to `/api/ai/process-command` matches the reseller system's
 *   `useVoiceCommand` body structure exactly.
 * - Header: `Content-Type: application/json` (no Authorization header;
 *   auth is body-based via `resellerId`).
 *
 * @param options - Optional overrides for tenant context, config, and history.
 *   The hook derives the definitive `resellerId` from
 *   `ZeederContext.clientProfile.resellerSlug`. An explicit `options.resellerId`
 *   takes precedence when supplied.
 *
 * @remarks
 * This hook is intentionally **zero-dependency** with respect to the
 * reseller domain. It does NOT import from:
 * - `src/contexts/HannahContext`
 * - `src/hooks/use-voice-command`
 * - `src/lib/reseller/*`
 *
 * @example
 * ```tsx
 * const { handleVoiceCommand, isProcessing } = useZeederVoice({ resellerId: 'lastchaptermedia2016' });
 *
 * const onUserSpeech = async (transcript: string) => {
 *   await handleVoiceCommand(transcript);
 * };
 * ```
 */
export function useZeederVoice(options?: UseZeederVoiceOptions): {
  /** Send a transcript to the ZEEDER process-command pipeline. */
  handleVoiceCommand: (text: string) => Promise<void>;
  /** True while a voice command is being processed. */
  isProcessing: boolean;
  /** The last error message if an operation failed. */
  error: string | null;
  /** Reset the error state to null. */
  clearError: () => void;
  /** True when the SYSTEM_HELP capabilities modal should be visible. */
  helpModalOpen: boolean;
  /** Dismiss (close) the SYSTEM_HELP capabilities modal. */
  dismissHelpModal: () => void;
} {
  const { dispatch, clientProfile, setMode, setExecutionState } = useZeeder();
  // Bridge to the Studio's single source of truth for persona state. This is
  // the Architect's "unified dispatcher": persona changes never touch the
  // disconnected ZeederContext — they flow straight into StudioDraftProvider.
  const { dispatchStudioAction } = useStudioDraft();
  const [state, setState] = useState<ZeederVoiceState>({
    isProcessing: false,
    error: null,
  });
  const [helpModalOpen, setHelpModalOpen] = useState(false);

  const {
    resellerId: _resellerId,
    tenantContext: _tenantContext,
    currentConfig: _currentConfig,
    contextCapabilities: _contextCapabilities,
    conversationHistory: _conversationHistory,
    agentMode: _agentMode,
  } = options ?? {};

  // Resolve resellerId: explicit option takes precedence, then fallback to context slug
  const resolvedResellerId =
    _resellerId?.trim() ??
    clientProfile?.resellerSlug?.trim() ??
    null;

  const clientProfileRef = useRef(clientProfile);
  useEffect(() => {
    clientProfileRef.current = clientProfile;
  }, [clientProfile]);

  // Guard against concurrent invocations
  const processingRef = useRef(false);

  /**
   * Play the AI summary response as speech via the TTS endpoint.
   */
  async function speakSummary(summary: string): Promise<void> {
    try {
      const ttsResponse = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: summary, voice: 'hannah' }),
      });
      if (!ttsResponse.ok) {
        console.error('[ZEEDER-VOICE] TTS request failed');
        return;
      }
      const audioBlob = await ttsResponse.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      audio.onended = () => URL.revokeObjectURL(audioUrl);
      await audio.play();
    } catch {
      console.error('[ZEEDER-VOICE] TTS playback failed');
    }
  }

  /**
   * Send a natural-language transcript through the ZEEDER voice-action pipeline.
   *
   * @param text - The user's spoken command (free-form text).
   */
  const handleVoiceCommand = useCallback(
    async (text: string): Promise<void> => {
      let currentResellerId = resolvedResellerId;

      console.log('[TRACE] handleVoiceCommand ENTRY');
      console.log('[TRACE] text:', `"${text}"`);
      console.log('[TRACE] text.length:', text.length);
      console.log('[TRACE] text.trim().length:', text.trim().length);
      console.log('[TRACE] clientProfile:', clientProfile);
      console.log('[TRACE] resolvedResellerId:', resolvedResellerId);

      const shouldSkipProcessing = processingRef.current;
      console.log('[TRACE] processingRef.current:', shouldSkipProcessing);
      if (shouldSkipProcessing) {
        console.warn('[ZEEDER-VOICE] handleVoiceCommand rejected — a command is already in flight.');
        return;
      }

      const isTextEmpty = !text || text.trim().length === 0;
      console.log('[TRACE] isTextEmpty:', isTextEmpty);
      if (isTextEmpty) {
        console.warn('[ZEEDER-VOICE] handleVoiceCommand called with empty text.');
        return;
      }

      // Deterministic override: when clientProfile has not yet hydrated,
      // poll for it instead of immediately rejecting.
      if (!clientProfileRef.current?.resellerSlug) {
        console.warn('[ZEEDER-VOICE] Profile not yet loaded, polling...');
        const hydrated = await pollForProfile(clientProfileRef, 2000);
        if (!hydrated?.resellerSlug) {
          console.error('[ZEEDER-VOICE] handleVoiceCommand rejected — resellerSlug is missing');
          return;
        }
        currentResellerId = hydrated.resellerSlug;
      }

      const isResellerIdMissing = !currentResellerId;
      console.log('[TRACE] isResellerIdMissing:', isResellerIdMissing);
      if (isResellerIdMissing) {
        console.warn('[ZEEDER-VOICE] handleVoiceCommand rejected — resellerSlug is missing from clientProfile');
        setExecutionState({
          activeActionId: null,
          startedAt: null,
          completedAt: Date.now(),
          error: 'Reseller not resolved.',
        });
        setMode('error');
        setState(prev => ({ ...prev, isProcessing: false, error: 'Reseller not resolved.' }));
        return;
      }

      const isInvalidSlugValue = isInvalidSlug(currentResellerId || '');
      console.log('[TRACE] isInvalidSlug:', isInvalidSlugValue);
      if (isInvalidSlugValue) {
        console.warn('[ZEEDER-VOICE] handleVoiceCommand rejected — resellerSlug is an unresolved hydration artifact:', currentResellerId);
        setExecutionState({
          activeActionId: null,
          startedAt: null,
          completedAt: Date.now(),
          error: 'Reseller not resolved.',
        });
        setMode('error');
        setState(prev => ({ ...prev, isProcessing: false, error: 'Reseller not resolved.' }));
        return;
      }

      console.log('[TRACE] PASSED ALL GUARDS - proceeding to API call');

      processingRef.current = true;
      setState(prev => ({ ...prev, isProcessing: true, error: null }));

      try {
        if (!currentResellerId) {
          console.warn('[ZEEDER-VOICE] handleVoiceCommand rejected — resellerSlug is missing from clientProfile');
          setExecutionState({
            activeActionId: null,
            startedAt: null,
            completedAt: Date.now(),
            error: 'Reseller not resolved.',
          });
          setMode('error');
          setState(prev => ({ ...prev, isProcessing: false, error: 'Reseller not resolved.' }));
          return;
        }

        if (isInvalidSlug(currentResellerId || '')) {
          console.warn('[ZEEDER-VOICE] handleVoiceCommand rejected — resellerSlug is an unresolved hydration artifact:', currentResellerId);
          setExecutionState({
            activeActionId: null,
            startedAt: null,
            completedAt: Date.now(),
            error: 'Reseller not resolved.',
          });
          setMode('error');
          setState(prev => ({ ...prev, isProcessing: false, error: 'Reseller not resolved.' }));
          return;
        }

        // ── Step 1: POST to the Groq-powered AI process-command API ──
        // Payload mirrors the /reseller `useVoiceCommand` configuration exactly.
        console.log('[ZEEDER-VOICE] Identity resolved as:', currentResellerId);
        console.log(`[ZEEDER-VOICE] Sending text to /api/ai/process-command: "${text.slice(0, 80)}..."`);

        const response = await fetch('/api/ai/process-command', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            resellerId: currentResellerId,
            userCommand: text,
            currentConfig: _currentConfig ?? {},
            contextCapabilities: _contextCapabilities,
            tenantContext: {
              tenantId: _tenantContext?.tenantId,
              category: _tenantContext?.category,
            },
            conversationHistory: _conversationHistory,
            agentMode: _agentMode,
          }),
        });

        if (!response.ok) {
          const errorBody = await response.json().catch(() => null);
          const errorMessage =
            errorBody?.error ?? `Server responded with status ${response.status}`;
          console.error(`[ZEEDER-VOICE] API returned ${response.status}: ${errorMessage}`);
          setState(prev => ({ ...prev, isProcessing: false, error: errorMessage }));
          return;
        }

        const data: {
          success?: boolean;
          actionType: string;
          targetIds?: string[];
          payload?: Record<string, unknown>;
          summary?: string;
          error?: string;
        } = await response.json();

        // ── Step 2: Map AI actionType to ZEEDER action ID ──────────
        const mappedActionId = ACTION_TYPE_TO_ZEEDER_ID[data.actionType] ?? null;

        // ── Unified Dispatcher: Persona bridge ─────────────────────
        // A persona-mode change (carried in aiPersona.personaMode, e.g. from a
        // SYSTEM_UPDATE_BRANDING payload that included persona) is routed
        // directly into the StudioDraftProvider — NEVER through ZeederContext.
        const rawPersonaMode =
          (data.payload as { aiPersona?: { personaMode?: unknown } } | undefined)?.aiPersona
            ?.personaMode;
        const personaMode =
          rawPersonaMode === 'sales' || rawPersonaMode === 'concierge'
            ? rawPersonaMode
            : null;

        if (personaMode) {
          dispatchStudioAction({ type: 'UPDATE_PERSONA', mode: personaMode });
          const spoken =
            data.summary
              ? `${data.summary} I've updated the draft to ${personaMode} mode — please click Save to commit these changes.`
              : `I've updated the draft to ${personaMode} mode — please click Save to commit these changes.`;
          await speakSummary(spoken);
          setState(prev => ({ ...prev, isProcessing: false }));
          console.log(`[ZEEDER-VOICE] Routed persona change → "${personaMode}" via StudioDraftProvider.`);
          return;
        }

        // Misrecognized persona mode (e.g. "concious"): do NOT fall through to the
        // ZeederContext DB-writing dispatch (Path A — no silent commit). Clarify and
        // return instead of producing a 400 from an invalid aiPersona payload.
        if (
          rawPersonaMode !== undefined &&
          rawPersonaMode !== null &&
          rawPersonaMode !== 'sales' &&
          rawPersonaMode !== 'concierge'
        ) {
          const spoken = `I didn't catch a valid persona mode. Please say "sales" or "concierge".`;
          await speakSummary(spoken);
          setState(prev => ({ ...prev, isProcessing: false }));
          console.warn(
            `[ZEEDER-VOICE] Rejected invalid personaMode "${String(rawPersonaMode)}" — clarified instead of dispatching.`
          );
          return;
        }

        // ── Post-Message Bridge: notify parent layout for non-dispatch actionTypes ──
        const uiIntent = ACTION_TYPE_TO_INTENT.get(data.actionType) ?? DEFAULT_UNKNOWN_INTENT;
        if (uiIntent && typeof window !== 'undefined') {
          window.postMessage(
            { type: 'hannah:intent-command', data: { intent: uiIntent } },
            window.location.origin,
          );
        }

        if (!mappedActionId) {
          // The AI responded with a non-ZEEDER action (e.g. SYSTEM_HELP,
          // NO_MATCH, SINGLE, BULK). This is a successful response but
          // doesn't map to a ZEEDER state-machine action — log and reset.
          console.log(
            `[ZEEDER-VOICE] AI responded with non-ZEEDER actionType: "${data.actionType}" — ${data.summary ?? 'no summary'}`,
          );

          // SYSTEM_HELP: elevate from speech-only to a visual capabilities modal.
          // Voice output is retained for accessibility, but the primary output
          // is the modal trigger owned by this hook's consumer.
          if (data.actionType === 'SYSTEM_HELP') {
            setHelpModalOpen(true);
          }

          if (data.summary) {
            await speakSummary(data.summary);
          }
          setState(prev => ({ ...prev, isProcessing: false }));
          return;
        }

        // Double-check the mapped actionId is valid (type-narrowing for dispatch)
        if (!isZeederActionId(mappedActionId)) {
          const errorMsg = `Mapped actionType "${data.actionType}" resolved to invalid actionId: "${mappedActionId}".`;
          console.error(`[ZEEDER-VOICE] ${errorMsg}`);
          setState(prev => ({ ...prev, isProcessing: false, error: errorMsg }));
          return;
        }

        // ── Step 3: Dispatch through ZeederContext ──────────────────
        const dispatchPayload = data.payload ?? {};
        console.log(
          `[ZEEDER-VOICE] Dispatching action: "${mappedActionId}" (from actionType: "${data.actionType}") with payload:`,
          dispatchPayload,
        );

        const result = await dispatch(mappedActionId, dispatchPayload);

        if (!result.success) {
          const fallbackMessage = result.error ?? 'Sorry, I wasn\'t able to complete that.';
          console.error(`[ZEEDER-VOICE] Action "${mappedActionId}" failed:`, result.error);
          await speakSummary(fallbackMessage);
          setState(prev => ({ ...prev, isProcessing: false }));
        } else {
          const spokenText = result.greeting ?? data.summary;
          if (spokenText) {
            await speakSummary(spokenText);
          }
          setState(prev => ({ ...prev, isProcessing: false }));
          console.log(`[ZEEDER-VOICE] Action "${mappedActionId}" completed successfully.`);
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
        console.error(`[ZEEDER-VOICE] Unhandled error:`, err);
        console.error(`[ZEEDER-VOICE] Error message: ${message}`);
        setState(prev => ({ ...prev, isProcessing: false, error: message }));
      } finally {
        processingRef.current = false;
      }
    },
    [
      dispatch,
      setMode,
      setExecutionState,
      dispatchStudioAction,
      resolvedResellerId,
      _currentConfig,
      _tenantContext,
      _contextCapabilities,
      _conversationHistory,
      _agentMode,
      clientProfile,
    ],
  );

  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  const dismissHelpModal = useCallback(() => {
    setHelpModalOpen(false);
  }, []);

  return {
    handleVoiceCommand,
    isProcessing: state.isProcessing,
    error: state.error,
    clearError,
    helpModalOpen,
    dismissHelpModal,
  };
}
