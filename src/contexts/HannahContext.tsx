'use client';

import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from 'react';
import type { CommandCapability } from '@/core/ai/system-capabilities';
import type { CommandIntent } from '@/lib/hooks/useCommandListener';
import { usePathname } from 'next/navigation';
import { useVoiceCommand } from '@/hooks/use-voice-command';

/**
 * HannahContext — Global AI Assistant State Provider
 *
 * Centralizes Hannah's awake/sleep state, the current briefing text,
 * the greeted latch, and the unified global PTT event loop so all
 * dashboard sub-views share a single source of truth.
 */

// ── Type-Safe Interface ────────────────────────────────────────────────
export interface HannahContextValue {
  /** Whether Hannah is awake and accepting voice commands. */
  isHannahAwake: boolean;
  /** Toggle Hannah's wake/sleep state. */
  setIsHannahAwake: (awake: boolean) => void;
  /** Current capability briefing text (or null if none). */
  currentBriefing: string | null;
  /** Update the current briefing text. */
  setCurrentBriefing: (briefing: string | null) => void;
  /** Whether a greeting has already been spoken for the current tenant. */
  hasGreeted: boolean;
  /** Mark greeting as spoken (or reset when switching tenants). */
  setHasGreeted: (greeted: boolean) => void;
  /** Currently active commands to display in the deck. */
  activeCommands: CommandCapability[];
  /** Set the commands to display in the deck. */
  setActiveCommands: (commands: CommandCapability[]) => void;

  /** Latest command intent trigger from the event bus. */
  commandIntent: CommandIntent | null;
  /** Update the active command intent. */
  setCommandIntent: (intent: CommandIntent | null) => void;

  /** Hannah operating mode: conversational vs executor. */
  agentMode: 'conversational' | 'executor';
  /** Switch Hannah's operating mode. */
  setAgentMode: (mode: 'conversational' | 'executor') => void;

  /** Conversation history for follow-up context. */
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string; timestamp: number }>;
  /** Append to conversation history. */
  appendConversationHistory: (entry: { role: 'user' | 'assistant'; content: string }) => void;
  /** Clear conversation history. */
  clearConversationHistory: () => void;

  /** Register a page-specific action dispatcher keyed by route. */
  registerActionDispatcher: (route: string, dispatcher: (action: Record<string, unknown>) => void) => void;
  /** Universal action dispatcher for AI-generated actions. */
  dispatchAction: (action: Record<string, unknown>, context: { tenantId?: string; resellerSlug: string }) => Promise<void>;

  /** ── Global PTT State ─────────────────────────────────────────── */
  /** True while the mic is actively capturing audio (global). */
  isRecording: boolean;
  /** True while the STT → AI → TTS pipeline is processing (global). */
  isProcessing: boolean;
  /** True while the TTS AudioContext is actively playing back audio (global). */
  isSpeaking: boolean;
  /** Live volume meter (0–1). Only updated while recording is active. */
  volumeLevel: number;
  /** Latest transcript from STT (global). */
  transcript: string;
  /** Latest error message, if any. */
  error: string | null;
  /** Current active route path (e.g., /revenue, /ai-engine). */
  activeRoute: string;
  /** Strict PTT: Begin audio capture. */
  startListening: () => Promise<void>;
  /** Strict PTT: Finalize audio and trigger pipeline. */
  stopListeningAndProcess: () => void;
  /** Strict PTT: Abort capture. */
  abortRecording: () => void;
  /** Reset all state to idle. */
  resetState: () => void;
}

// ── Context Instance ───────────────────────────────────────────────────
const HannahContext = createContext<HannahContextValue | undefined>(undefined);

// ── Provider Component ─────────────────────────────────────────────────
export function HannahProvider({ children, resellerSlug }: { children: ReactNode; resellerSlug?: string }) {
  const [isHannahAwake, setIsHannahAwakeState] = useState(true);
  const [currentBriefing, setCurrentBriefing] = useState<string | null>(null);
  const [hasGreeted, setHasGreetedState] = useState(false);
  const [activeCommands, setActiveCommandsState] = useState<CommandCapability[]>([]);
  const [commandIntent, setCommandIntentState] = useState<CommandIntent | null>(null);
  const [agentMode, setAgentModeState] = useState<'conversational' | 'executor'>('executor');
  const [conversationHistory, setConversationHistory] = useState<Array<{ role: 'user' | 'assistant'; content: string; timestamp: number }>>([]);

  const setIsHannahAwake = useCallback((awake: boolean) => {
    setIsHannahAwakeState(awake);
  }, []);

  const setHasGreeted = useCallback((greeted: boolean) => {
    setHasGreetedState(greeted);
  }, []);

  const setActiveCommands = useCallback((commands: CommandCapability[]) => {
    setActiveCommandsState(commands);
  }, []);

  const setCommandIntent = useCallback((intent: CommandIntent | null) => {
    setCommandIntentState(intent);
  }, []);

  const setAgentMode = useCallback((mode: 'conversational' | 'executor') => {
    setAgentModeState(mode);
  }, []);

  const appendConversationHistory = useCallback((entry: { role: 'user' | 'assistant'; content: string }) => {
    setConversationHistory(prev => [...prev.slice(-20), { ...entry, timestamp: Date.now() }]);
  }, []);

  const clearConversationHistory = useCallback(() => {
    setConversationHistory([]);
  }, []);

  const actionDispatchersRef = useRef<Record<string, (action: Record<string, unknown>) => void>>({});

  const pathname = usePathname();
  // Extract route scope (e.g., /revenue, /ai-engine, /signal) from pathname
  const activeRoute = pathname.split('/').filter(Boolean).slice(1).join('/') || 'dashboard';

  const registerActionDispatcher = useCallback((route: string, dispatcher: (action: Record<string, unknown>) => void) => {
    actionDispatchersRef.current[route] = dispatcher;
  }, []);

  const dispatchAction = useCallback(async (action: Record<string, unknown>, _context: { tenantId?: string; resellerSlug: string }) => {
    const dispatcher = actionDispatchersRef.current[activeRoute];
    if (dispatcher) {
      await dispatcher(action);
    } else {
      console.warn(`[HannahContext] No dispatcher registered for route: ${activeRoute}`);
    }
  }, [activeRoute]);

  const voice = useVoiceCommand({ resellerId: resellerSlug });

  const startListening = voice.startListening;
  const stopListeningAndProcess = voice.stopListeningAndProcess;
  const abortRecording = voice.abortRecording;
  const resetState = voice.resetState;

  const value: HannahContextValue = {
    isHannahAwake,
    setIsHannahAwake,
    currentBriefing,
    setCurrentBriefing,
    hasGreeted,
    setHasGreeted,
    activeCommands,
    setActiveCommands,
    commandIntent,
    setCommandIntent,
    agentMode,
    setAgentMode,
    conversationHistory,
    appendConversationHistory,
    clearConversationHistory,
    registerActionDispatcher,
    dispatchAction,
    isRecording: voice.isRecording,
    isProcessing: voice.isProcessing,
    isSpeaking: voice.isSpeaking,
    volumeLevel: voice.volumeLevel,
    transcript: voice.transcript,
    error: voice.error,
    activeRoute,
    startListening,
    stopListeningAndProcess,
    abortRecording,
    resetState,
  };

  return (
    <HannahContext.Provider value={value}>
      {children}
    </HannahContext.Provider>
  );
}

// ── Consumer Hook ──────────────────────────────────────────────────────
export function useHannah(): HannahContextValue {
  const ctx = useContext(HannahContext);
  if (ctx === undefined) {
    throw new Error('useHannah must be used within a <HannahProvider>');
  }
  return ctx;
}

// ── Route Segment Guard ────────────────────────────────────────────────
export function useActiveRoute(): string {
  const { activeRoute } = useHannah();
  return activeRoute;
}