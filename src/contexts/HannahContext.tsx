'use client';

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import type { CommandCapability } from '@/core/ai/system-capabilities';
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

  const setIsHannahAwake = useCallback((awake: boolean) => {
    setIsHannahAwakeState(awake);
  }, []);

  const setHasGreeted = useCallback((greeted: boolean) => {
    setHasGreetedState(greeted);
  }, []);


  const setActiveCommands = useCallback((commands: CommandCapability[]) => {
    setActiveCommandsState(commands);
  }, []);

  const pathname = usePathname();
  // Extract route scope (e.g., /revenue, /ai-engine, /signal) from pathname
  const activeRoute = pathname.split('/').filter(Boolean).slice(1).join('/') || 'dashboard';

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
