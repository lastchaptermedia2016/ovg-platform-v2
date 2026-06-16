'use client';

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

/**
 * HannahContext — Global AI Assistant State Provider
 *
 * Centralizes Hannah's awake/sleep state, the current briefing text,
 * and the greeted latch so all dashboard sub-views share a single
 * source of truth instead of duplicating state inside individual components.
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
}

// ── Context Instance ───────────────────────────────────────────────────
const HannahContext = createContext<HannahContextValue | undefined>(undefined);

// ── Provider Component ─────────────────────────────────────────────────
export function HannahProvider({ children }: { children: ReactNode }) {
  const [isHannahAwake, setIsHannahAwakeState] = useState(true);
  const [currentBriefing, setCurrentBriefing] = useState<string | null>(null);
  const [hasGreeted, setHasGreetedState] = useState(false);

  const setIsHannahAwake = useCallback((awake: boolean) => {
    setIsHannahAwakeState(awake);
  }, []);

  const setHasGreeted = useCallback((greeted: boolean) => {
    setHasGreetedState(greeted);
  }, []);

  const value: HannahContextValue = {
    isHannahAwake,
    setIsHannahAwake,
    currentBriefing,
    setCurrentBriefing,
    hasGreeted,
    setHasGreeted,
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