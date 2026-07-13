"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

// ── Type-Safe Interface ────────────────────────────────────────────────
export interface CommandDeckContextValue {
  isCommandDeckOpen: boolean;
  setCommandDeckOpen: (open: boolean) => void;
}

// ── Context Instance ───────────────────────────────────────────────────
const CommandDeckContext = createContext<CommandDeckContextValue | undefined>(undefined);

// ── Provider Component ─────────────────────────────────────────────────
export function CommandDeckProvider({ children }: { children: ReactNode }) {
  const [isCommandDeckOpen, setCommandDeckOpenState] = useState(false);

  const setCommandDeckOpen = useCallback((open: boolean) => {
    setCommandDeckOpenState(open);
  }, []);

  const value: CommandDeckContextValue = {
    isCommandDeckOpen,
    setCommandDeckOpen,
  };

  return (
    <CommandDeckContext.Provider value={value}>
      {children}
    </CommandDeckContext.Provider>
  );
}

// ── Consumer Hook ──────────────────────────────────────────────────────
export function useCommandDeck(): CommandDeckContextValue {
  const ctx = useContext(CommandDeckContext);
  // Graceful no-op fallback: the production ChatWidget is rendered outside the
  // reseller CommandDeck (e.g. the studio preview canvas), and useVoiceCommand
  // depends on this hook. Degrading instead of throwing keeps the widget usable
  // in those contexts without forcing a provider mount.
  if (ctx === undefined) {
    return { isCommandDeckOpen: false, setCommandDeckOpen: () => {} };
  }
  return ctx;
}