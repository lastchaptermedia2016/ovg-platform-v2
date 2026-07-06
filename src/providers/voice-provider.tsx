'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { usePathname } from 'next/navigation';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  useAgenticColleague,
  type UseAgenticColleagueReturn,
} from '@/hooks/useAgenticColleague';
import {
  CognitiveOrchestrator,
  UserPreferenceHistory,
  type UiTrigger,
} from '@/lib/ai/cognitive-orchestrator';
import type { AuthContext } from '@/lib/actions/auth-middleware';

// ──────────────────────────────────────────────────────────────────────────────
// Voice status state machine
// ──────────────────────────────────────────────────────────────────────────────

export type VoiceStatus = 'idle' | 'listening' | 'processing' | 'speaking';

// ──────────────────────────────────────────────────────────────────────────────
// Context value shapes
// ──────────────────────────────────────────────────────────────────────────────

/** Reactive state — changes frequently; only UI indicators subscribe here. */
export interface VoiceState {
  status: VoiceStatus;
  isListening: boolean;
  isProcessing: boolean;
  isSpeaking: boolean;
  currentRoute: string | null;
  /** True when the user navigated away while a proposal was pending. */
  pendingNavigation: boolean;
}

/** Stable control surface — memoized once, so subscribers don't re-render on state. */
export interface VoiceControls {
  /** Begin a PTT recording session (status -> listening). */
  startListening: () => void;
  /** End a PTT recording session; routes captured text to the colleague. */
  stopListening: () => void;
  /** Toggle PTT (used by the global Spacebar shortcut). */
  togglePushToTalk: () => void;
  /** Feed recognized speech text into the agentic colleague. */
  submitUtterance: (text: string) => Promise<void>;
  /** Confirm + commit the pending proposal. */
  commitChanges: () => Promise<void>;
  /** Cancel speech and clear the active proposal. */
  cancelProposal: () => void;
  /** Persist the carried-over proposal and clear the navigation prompt. */
  persistProposal: () => void;
}

const VoiceStateContext = createContext<VoiceState | null>(null);
const VoiceControlsContext = createContext<VoiceControls | null>(null);
const VoiceColleagueContext = createContext<UseAgenticColleagueReturn | null>(null);

// ──────────────────────────────────────────────────────────────────────────────
// Provider
// ──────────────────────────────────────────────────────────────────────────────

export interface VoiceProviderProps {
  children: ReactNode;
  /** Identity + tenancy context for AuthMiddleware (resolved by the caller). */
  authContext: AuthContext;
  /** Supabase client used to build the AuthDbClient dependency for the registry. */
  supabase: SupabaseClient;
  /** Globally captures Spacebar as a PTT toggle. Default true. */
  enableGlobalHotkey?: boolean;
  /** When false, audio feedback (speech synthesis) is suppressed. Default true. */
  enableAudio?: boolean;
  /**
   * Fired when the orchestrator raises a UI trigger (e.g. 'OPEN_CAPABILITIES').
   * The AI stays "dumb" to the UI — this is the only channel by which the UI is
   * asked to open a surface. The consumer decides how to render it (soft overlay).
   */
  onTriggerUI?: (trigger: UiTrigger) => void;
}

export function VoiceProvider({
  children,
  authContext,
  supabase,
  enableGlobalHotkey = true,
  enableAudio = true,
  onTriggerUI,
}: VoiceProviderProps) {
  const pathname = usePathname();

  // The reasoning "Brain" is owned here so UserPreferenceHistory and the
  // reasoning context persist for the lifetime of the session (the provider is
  // mounted once at the studio root). Passed into the colleague hook.
  const orchestrator = useMemo(
    () => new CognitiveOrchestrator({ preferences: new UserPreferenceHistory() }),
    []
  );

  const colleague = useAgenticColleague({
    authContext,
    supabase,
    orchestrator,
    enableAudio,
  });

  // UI Trigger bus: when the orchestrator raises a signal (e.g. capabilities
  // query), hand it to the consumer. The AI never opens UI itself — this is the
  // single seam. We only fire on a fresh, non-null trigger value.
  const lastTriggerRef = useRef<UiTrigger | null>(null);
  useEffect(() => {
    const trigger = colleague.uiTrigger;
    if (trigger && trigger !== lastTriggerRef.current) {
      lastTriggerRef.current = trigger;
      onTriggerUI?.(trigger);
    }
    if (!trigger) lastTriggerRef.current = null;
  }, [colleague.uiTrigger, onTriggerUI]);

  const [isListening, setIsListening] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState(false);

  // Latest values without re-binding the hotkey handler, synced in an effect
  // (refs must not be written during render).
  const isListeningRef = useRef(isListening);
  const pathnameRef = useRef(pathname);
  const pendingIntentsRef = useRef(colleague.pendingIntents);
  const lastSpokenRef = useRef(colleague.lastSpoken);
  useEffect(() => {
    isListeningRef.current = isListening;
    pathnameRef.current = pathname;
    pendingIntentsRef.current = colleague.pendingIntents;
    lastSpokenRef.current = colleague.lastSpoken;
  });

  // ── Welcome (Zeeder identifies itself once, on mount) ───────────────────────
  // Spoken only when audio is enabled, and only after the auth context is ready
  // so we don't greet on a half-initialized tree.
  const greetedRef = useRef(false);
  useEffect(() => {
    if (greetedRef.current || !enableAudio) return;
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    greetedRef.current = true;
    const utter = new SpeechSynthesisUtterance(
      "Hi, I'm Zeeder, your Lead Architect. I'm ready to help you design your widget."
    );
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utter);
  }, [enableAudio, authContext]);

  // ── Status derivation ───────────────────────────────────────────────────────
  const status: VoiceStatus = isListening
    ? 'listening'
    : colleague.isProcessing
      ? 'processing'
      : colleague.lastSpoken && typeof window !== 'undefined' && 'speechSynthesis' in window && window.speechSynthesis.speaking
        ? 'speaking'
        : 'idle';

  // ── Navigation safety ─────────────────────────────────────────────────────
  // The StudioDraft lives in the parent StudioDraftProvider, so a proposed draft
  // "carries" across pages automatically. We only surface a prompt to either
  // persist or cancel the pending proposal when the route changes mid-flight.
  const prevRouteRef = useRef(pathname);
  useEffect(() => {
    if (prevRouteRef.current && prevRouteRef.current !== pathname) {
      if (pendingIntentsRef.current.length > 0) {
        setPendingNavigation(true);
      }
    }
    prevRouteRef.current = pathname;
  }, [pathname]);

  // ── PTT controls ────────────────────────────────────────────────────────────
  const startListening = useCallback(() => {
    setIsListening(true);
  }, []);

  const stopListening = useCallback(() => {
    setIsListening(false);
  }, []);

  const togglePushToTalk = useCallback(() => {
    setIsListening((prev) => !prev);
  }, []);

  const submitUtterance = useCallback(
    async (text: string) => {
      if (!text.trim()) return;
      // Mirror the status machine: processing while the colleague works.
      setIsListening(false);
      await colleague.processUtterance(text, pathnameRef.current);
    },
    [colleague]
  );

  const commitChanges = useCallback(async () => {
    await colleague.commitChanges();
    setPendingNavigation(false);
  }, [colleague]);

  const cancelProposal = useCallback(() => {
    colleague.interrupt();
    setPendingNavigation(false);
    // Clear pending proposal by committing nothing / resetting via interrupt.
    // The proposal was only a draft (not yet committed), so clearing audio +
    // the navigation prompt is sufficient; the draft remains editable.
  }, [colleague]);

  const persistProposal = useCallback(() => {
    // The draft is already carried by StudioDraftProvider; simply dismiss the
    // navigation prompt and let the user commit later from the new page.
    setPendingNavigation(false);
  }, []);

  // ── Global Spacebar hotkey ──────────────────────────────────────────────────
  useEffect(() => {
    if (!enableGlobalHotkey || typeof window === 'undefined') return;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);
      if (typing) return; // don't hijack Space while the user types
      if (e.code === 'Space') {
        e.preventDefault();
        togglePushToTalk();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enableGlobalHotkey, togglePushToTalk]);

  // ── Context values (split for render isolation) ─────────────────────────────
  const stateValue = useMemo<VoiceState>(
    () => ({
      status,
      isListening,
      isProcessing: colleague.isProcessing,
      isSpeaking: status === 'speaking',
      currentRoute: pathname,
      pendingNavigation,
    }),
    [status, isListening, colleague.isProcessing, pathname, pendingNavigation]
  );

  const controlsValue = useMemo<VoiceControls>(
    () => ({
      startListening,
      stopListening,
      togglePushToTalk,
      submitUtterance,
      commitChanges,
      cancelProposal,
      persistProposal,
    }),
    [
      startListening,
      stopListening,
      togglePushToTalk,
      submitUtterance,
      commitChanges,
      cancelProposal,
      persistProposal,
    ]
  );

  return (
    <VoiceStateContext.Provider value={stateValue}>
      <VoiceControlsContext.Provider value={controlsValue}>
        <VoiceColleagueContext.Provider value={colleague}>
          {children}
        </VoiceColleagueContext.Provider>
      </VoiceControlsContext.Provider>
    </VoiceStateContext.Provider>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Hooks
// ──────────────────────────────────────────────────────────────────────────────

export function useVoiceState(): VoiceState {
  const ctx = useContext(VoiceStateContext);
  if (!ctx) throw new Error('useVoiceState must be used within a VoiceProvider');
  return ctx;
}

export function useVoiceControls(): VoiceControls {
  const ctx = useContext(VoiceControlsContext);
  if (!ctx) throw new Error('useVoiceControls must be used within a VoiceProvider');
  return ctx;
}

/** Convenience accessor for the underlying colleague (plan, outcome, etc.). */
export function useVoiceColleague(): UseAgenticColleagueReturn {
  const ctx = useContext(VoiceColleagueContext);
  if (!ctx) throw new Error('useVoiceColleague must be used within a VoiceProvider');
  return ctx;
}
