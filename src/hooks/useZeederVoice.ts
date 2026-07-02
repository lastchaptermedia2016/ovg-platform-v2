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

import { useState, useCallback, useRef } from 'react';
import { isInvalidSlug } from '@/lib/utils/guard';
import { useZeeder } from '@/contexts/ZeederContext';
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
} {
  const { dispatch, clientProfile, setMode, setExecutionState } = useZeeder();
  const [state, setState] = useState<ZeederVoiceState>({
    isProcessing: false,
    error: null,
  });

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

  // Guard against concurrent invocations
  const processingRef = useRef(false);

  /**
   * Send a natural-language transcript through the ZEEDER voice-action pipeline.
   *
   * @param text - The user's spoken command (free-form text).
   */
  const handleVoiceCommand = useCallback(
    async (text: string): Promise<void> => {
      if (processingRef.current) {
        console.warn('[ZEEDER-VOICE] handleVoiceCommand rejected — a command is already in flight.');
        return;
      }

      if (!text || text.trim().length === 0) {
        console.warn('[ZEEDER-VOICE] handleVoiceCommand called with empty text.');
        return;
      }

      processingRef.current = true;
      setState(prev => ({ ...prev, isProcessing: true, error: null }));

      try {
        // ── Guard: block if resellerSlug is missing from context ──
        if (!resolvedResellerId) {
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

        // ── Guard: block if resellerSlug is an unresolved hydration artifact ──
        if (isInvalidSlug(resolvedResellerId)) {
          console.warn('[ZEEDER-VOICE] handleVoiceCommand rejected — resellerSlug is an unresolved hydration artifact:', resolvedResellerId);
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
        console.log('[ZEEDER-VOICE] Identity resolved as:', resolvedResellerId);
        console.log(`[ZEEDER-VOICE] Sending text to /api/ai/process-command: "${text.slice(0, 80)}..."`);

        const response = await fetch('/api/ai/process-command', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            resellerId: resolvedResellerId,
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

        if (!mappedActionId) {
          // The AI responded with a non-ZEEDER action (e.g. SYSTEM_HELP,
          // NO_MATCH, SINGLE, BULK). This is a successful response but
          // doesn't map to a ZEEDER state-machine action — log and reset.
          console.log(
            `[ZEEDER-VOICE] AI responded with non-ZEEDER actionType: "${data.actionType}" — ${data.summary ?? 'no summary'}`,
          );
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

        await dispatch(mappedActionId, dispatchPayload);

        // ── Step 4: Reset state (idle) ──────────────────────────────
        setState(prev => ({ ...prev, isProcessing: false }));
        console.log(`[ZEEDER-VOICE] Action "${mappedActionId}" completed successfully.`);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
        console.error(`[ZEEDER-VOICE] Unhandled error: ${message}`);
        setState(prev => ({ ...prev, isProcessing: false, error: message }));
      } finally {
        processingRef.current = false;
      }
    },
    [
      dispatch,
      setMode,
      setExecutionState,
      resolvedResellerId,
      _currentConfig,
      _tenantContext,
      _contextCapabilities,
      _conversationHistory,
      _agentMode,
    ],
  );

  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  return {
    handleVoiceCommand,
    isProcessing: state.isProcessing,
    error: state.error,
    clearError,
  };
}
