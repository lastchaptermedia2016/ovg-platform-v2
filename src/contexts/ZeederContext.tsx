'use client';

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
  type ReactNode,
} from 'react';
import { zeederActionRegistry, type ZeederActionId } from '@/lib/zeeder/action-registry';

// ──────────────────────────── Type Definitions ───────────────────────────

/**
 * ZEEDER operational mode — a strict state machine that drives the
 * client-side execution lifecycle.
 *
 * - `idle`          : No action is in progress; ready to accept commands.
 * - `executing`     : An action has been dispatched and is being processed.
 * - `awaiting_input`: The current action requires additional user input.
 * - `error`         : The last action terminated with a non-recoverable error.
 */
export type ZeederOperationalMode = 'idle' | 'executing' | 'awaiting_input' | 'error';

/**
 * Tracks the execution state of the currently active ZEEDER action.
 */
export interface ZeederExecutionState {
  /** The action ID currently being executed, or null if idle. */
  activeActionId: ZeederActionId | null;
  /** Timestamp (ms) when execution started, or null. */
  startedAt: number | null;
  /** Timestamp (ms) when execution completed, or null. */
  completedAt: number | null;
  /** Human-readable error message if the action failed, or null. */
  error: string | null;
}

/**
 * Lightweight profile for the currently authenticated client.
 *
 * Derived from Supabase session metadata — no new database tables required.
 */
export interface ZeederClientProfile {
  /** Authenticated user id (from the Supabase session). */
  id?: string;
  /** Client's display name (from `user_metadata.name` or fallback email). */
  name: string;
  /** Client's email address. */
  email: string;
  /** Reseller slug associated with the authenticated user, used as the
   *  `resellerId` for AI voice API calls. */
  resellerSlug?: string;
  /** ISO timestamp of the client's last login, if available. */
  lastLogin?: string;
}

/**
 * The shape exposed by {@link ZeederContext}.
 */
export interface ZeederContextValue {
  /** Current operational mode of the ZEEDER state machine. */
  mode: ZeederOperationalMode;
  /** Transition the state machine to a new mode. */
  setMode: (mode: ZeederOperationalMode) => void;
  /** Current execution state snapshot. */
  executionState: ZeederExecutionState;
  /** Replace the entire execution state. */
  setExecutionState: (state: ZeederExecutionState) => void;
  /** Profile of the currently authenticated client, or null if unknown. */
  clientProfile: ZeederClientProfile | null;
  /**
   * Look up an action in the registry and execute it.
   * Automatically manages the `idle → executing → idle` lifecycle.
   *
   * The current `clientProfile` is auto-injected into the handler payload
   * under the `_clientProfile` key so that registry handlers can personalise
   * responses (e.g. greetings, branding updates).
   *
   * @param actionId - The registered action identifier.
   * @param payload  - Arbitrary key-value payload forwarded to the handler.
   * @returns The action result including success status, greeting, and error info.
   */
  dispatch: (actionId: ZeederActionId, payload: Record<string, unknown>) => Promise<{ success: boolean; greeting?: string; error?: string }>;
}

// ──────────────────────────── Context Instance ───────────────────────────

const ZeederContext = createContext<ZeederContextValue | undefined>(undefined);

// ──────────────────────────── Provider Component ─────────────────────────

/**
 * ZeederProvider
 *
 * Wraps a subtree with ZEEDER's operational state machine. Every client-side
 * UI action driven by ZEEDER must be a consumer of this context.
 *
 * @param clientProfile - Optional. The authenticated client's profile, used
 *   to personalise greetings and action responses. Derived from the existing
 *   Supabase session — no new tables required.
 *
 * @remarks
 * This provider is intentionally **zero-dependency** with respect to the
 * reseller domain. It does not import HannahContext, use-voice-command, or
 * any reseller-scoped utility.
 */
export function ZeederProvider({
  children,
  clientProfile = null,
}: {
  children: ReactNode;
  clientProfile?: ZeederClientProfile | null;
}) {
  const [mode, setMode] = useState<ZeederOperationalMode>('idle');
  const [executionState, setExecutionState] = useState<ZeederExecutionState>({
    activeActionId: null,
    startedAt: null,
    completedAt: null,
    error: null,
  });
  const profile = clientProfile;

  // Guard against concurrent dispatches
  const dispatchInFlight = useRef(false);

  // Expose resolved client profile for /client verification
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.__ZEEDER_DEBUG_PROFILE__ = clientProfile;
    }
  }, [clientProfile]);

  const dispatch = useCallback(
    async (actionId: ZeederActionId, payload: Record<string, unknown>): Promise<{ success: boolean; greeting?: string; error?: string }> => {
      if (dispatchInFlight.current) {
        console.warn(
          `[ZeederContext] dispatch("${actionId}") rejected — an action is already in flight.`,
        );
        return { success: false, error: 'An action is already in flight.' };
      }

      const entry = zeederActionRegistry.get(actionId);
      if (!entry) {
        console.error(`[ZeederContext] No action registered for id "${actionId}".`);
        setExecutionState({
          activeActionId: actionId,
          startedAt: null,
          completedAt: Date.now(),
          error: `Unknown action "${actionId}"`,
        });
        setMode('error');
        return { success: false, error: `Unknown action "${actionId}"` };
      }

      dispatchInFlight.current = true;

      const startedAt = Date.now();
      setExecutionState({
        activeActionId: actionId,
        startedAt,
        completedAt: null,
        error: null,
      });
      setMode('executing');

      try {
        // Auto-inject client profile so registry handlers can personalise
        const enrichedPayload = profile
          ? { ...payload, _clientProfile: profile }
          : payload;

        const result = await entry.handler(enrichedPayload);

        if (!result.success) {
          setExecutionState({
            activeActionId: actionId,
            startedAt,
            completedAt: Date.now(),
            error: result.error ?? 'Action returned a non-success result.',
          });
          setMode('error');
          return { success: false, error: result.error ?? 'Action returned a non-success result.' };
        }

        // Check if the handler indicated it needs further user input
        if (result.awaitingInput) {
          setMode('awaiting_input');
        } else {
          setMode('idle');
        }

        setExecutionState({
          activeActionId: null,
          startedAt,
          completedAt: Date.now(),
          error: null,
        });

        return { success: true, greeting: result.greeting };
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : 'An unexpected error occurred during dispatch.';
        setExecutionState({
          activeActionId: actionId,
          startedAt,
          completedAt: Date.now(),
          error: message,
        });
        setMode('error');
        return { success: false, error: message };
      } finally {
        dispatchInFlight.current = false;
      }
    },
    [profile],
  );

  const value: ZeederContextValue = {
    mode,
    setMode,
    executionState,
    setExecutionState,
    clientProfile: profile,
    dispatch,
  };

  return <ZeederContext.Provider value={value}>{children}</ZeederContext.Provider>;
}

// ──────────────────────────── Consumer Hook ──────────────────────────────

/**
 * useZeeder
 *
 * Access the nearest {@link ZeederContextValue} from the component tree.
 *
 * @throws {Error} If called outside of a `<ZeederProvider>`.
 */
export function useZeeder(): ZeederContextValue {
  const ctx = useContext(ZeederContext);
  if (ctx === undefined) {
    throw new Error('useZeeder must be used within a <ZeederProvider>');
  }
  return ctx;
}