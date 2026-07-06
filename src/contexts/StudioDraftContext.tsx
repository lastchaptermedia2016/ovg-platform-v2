'use client';

import { createContext, useContext, ReactNode, useState } from 'react';

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
};

export function isImageMode(config: BackgroundConfig) {
  return config.type === 'image';
}

interface StudioDraftContextType {
  draft: StudioDraft;
  setDraft: React.Dispatch<React.SetStateAction<StudioDraft>>;
  isImageMode: (config: BackgroundConfig) => boolean;
}

const StudioDraftContext = createContext<StudioDraftContextType | undefined>(undefined);

export function useStudioDraft() {
  const context = useContext(StudioDraftContext);
  if (context === undefined) {
    throw new Error('useStudioDraft must be used within a StudioDraftProvider');
  }
  return context;
}

export function StudioDraftProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<StudioDraft>({
    primaryColor: '#1A73E8',
    logoUrl: '',
    widgetPosition: 'bottom-right',
    header: { type: 'none' },
    footer: { type: 'none' },
  });

  return (
    <StudioDraftContext.Provider value={{ draft, setDraft, isImageMode }}>
      {children}
    </StudioDraftContext.Provider>
  );
}
