'use client';

import { createContext, useContext, ReactNode, useState, useCallback } from 'react';
import type { CanonicalBranding, CanonicalAIPersona } from '@/lib/schemas/tenant-config.canonical';

export type BackgroundConfig = {
  type: 'none' | 'solid' | 'image';
  image?: string;
  colorStart?: string;
};

export type StudioDraft = {
  primaryColor: string;
  logoUrl: string;
  widgetPosition: string;
  header: BackgroundConfig;
  footer: BackgroundConfig;
  personaMode: 'sales' | 'concierge';
  systemPrompt: string;
  temperature: number;
  voiceId: string;
};

export function toCanonicalBranding(draft: StudioDraft): Partial<CanonicalBranding> {
  return {
    primaryColor: draft.primaryColor,
    logoUrl: draft.logoUrl,
    widgetPosition: draft.widgetPosition as CanonicalBranding['widgetPosition'],
    headerConfig: draft.header.type !== 'none' ? {
      type: draft.header.type,
      image: draft.header.image,
      colorStart: draft.header.colorStart,
    } : undefined,
    footerConfig: draft.footer.type !== 'none' ? {
      type: draft.footer.type,
      image: draft.footer.image,
      colorStart: draft.footer.colorStart,
    } : undefined,
  };
}

export function toCanonicalAIPersona(draft: StudioDraft): Partial<CanonicalAIPersona> {
  return {
    name: draft.personaMode === 'sales' ? 'Sales Assistant' : 'Concierge Assistant',
    personaMode: draft.personaMode,
    systemPrompt: draft.systemPrompt,
    temperature: draft.temperature,
    voiceId: draft.voiceId,
  };
}

export function isImageMode(config: BackgroundConfig) {
  return config.type === 'image';
}

interface StudioDraftContextType {
  draft: StudioDraft;
  setDraft: React.Dispatch<React.SetStateAction<StudioDraft>>;
  isImageMode: (config: BackgroundConfig) => boolean;
  /**
   * Atomic, voice-friendly bridge for persona changes. The legacy voice path
   * (useZeederVoice) routes an UPDATE_PERSONA intent through this single
   * surface so the StudioDraftProvider remains the sole source of truth — no
   * detached event listeners or duplicate state trees.
   */
  dispatchStudioAction: (action: { type: 'UPDATE_PERSONA'; mode: 'sales' | 'concierge' }) => void;
}

const StudioDraftContext = createContext<StudioDraftContextType | undefined>(undefined);

export function useStudioDraft() {
  const context = useContext(StudioDraftContext);
  if (context === undefined) {
    throw new Error('useStudioDraft must be used within a StudioDraftProvider');
  }
  return context;
}

/**
 * Imperative bridge consumed by the voice layer. Maps a persona-mode action
 * onto the canonical StudioDraft, mirroring exactly what the Persona page's
 * own toggle does — including resetting the system prompt to the default
 * template for the chosen mode.
 */
const DEFAULT_SYSTEM_PROMPTS: Record<'sales' | 'concierge', string> = {
  sales:
    "You are a sales-focused AI assistant. Your primary goal is to qualify leads, understand customer needs, and guide them toward a purchase decision. Be persuasive yet professional. Ask discovery questions to identify pain points, present relevant solutions, and create urgency when appropriate. Always maintain a helpful tone while driving toward conversion.",
  concierge:
    "You are a concierge-style AI assistant. Your primary goal is to provide exceptional hospitality and personalized service. Anticipate needs, offer thoughtful recommendations, and ensure every interaction feels premium and caring. Prioritize customer comfort and satisfaction. Be attentive to details and proactive in offering assistance.",
};

export function StudioDraftProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<StudioDraft>({
    primaryColor: '#1A73E8',
    logoUrl: '',
    widgetPosition: 'bottom-right',
    header: { type: 'none' },
    footer: { type: 'none' },
    personaMode: 'sales',
    systemPrompt: '',
    temperature: 0.3,
    voiceId: '',
  });

  const dispatchStudioAction = useCallback(
    (action: { type: 'UPDATE_PERSONA'; mode: 'sales' | 'concierge' }) => {
      if (action.type === 'UPDATE_PERSONA') {
        setDraft((prev) =>
          prev.personaMode === action.mode
            ? prev
            : {
                ...prev,
                personaMode: action.mode,
                systemPrompt: DEFAULT_SYSTEM_PROMPTS[action.mode],
              }
        );
      }
    },
    []
  );

  return (
    <StudioDraftContext.Provider value={{ draft, setDraft, isImageMode, dispatchStudioAction }}>
      {children}
    </StudioDraftContext.Provider>
  );
}
