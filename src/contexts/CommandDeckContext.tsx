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
  if (ctx === undefined) {
    throw new Error("useCommandDeck must be used within a <CommandDeckProvider>");
  }
  return ctx;
}