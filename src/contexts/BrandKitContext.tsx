'use client';

import { createContext, useContext, useState, ReactNode } from 'react';

interface BrandKitState {
  template: 'general' | 'automotive';
  botPersonality: 'professional' | 'aggressive' | 'informational';
  headerUrl: string | null;
  footerUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  customDirectives: string;
  setTemplate: (template: 'general' | 'automotive') => void;
  setBotPersonality: (personality: 'professional' | 'aggressive' | 'informational') => void;
  setHeaderUrl: (url: string | null) => void;
  setFooterUrl: (url: string | null) => void;
  setPrimaryColor: (color: string) => void;
  setSecondaryColor: (color: string) => void;
  setCustomDirectives: (directives: string) => void;
}

const BrandKitContext = createContext<BrandKitState | undefined>(undefined);

export function BrandKitProvider({ children }: { children: ReactNode }) {
  const [template, setTemplate] = useState<'general' | 'automotive'>('general');
  const [botPersonality, setBotPersonality] = useState<'professional' | 'aggressive' | 'informational'>('professional');
  const [headerUrl, setHeaderUrl] = useState<string | null>(null);
  const [footerUrl, setFooterUrl] = useState<string | null>(null);
  const [primaryColor, setPrimaryColor] = useState('#0097b2');
  const [secondaryColor, setSecondaryColor] = useState('#226683');
  const [customDirectives, setCustomDirectives] = useState('');

  return (
    <BrandKitContext.Provider
      value={{
        template,
        botPersonality,
        headerUrl,
        footerUrl,
        primaryColor,
        secondaryColor,
        customDirectives,
        setTemplate,
        setBotPersonality,
        setHeaderUrl,
        setFooterUrl,
        setPrimaryColor,
        setSecondaryColor,
        setCustomDirectives,
      }}
    >
      {children}
    </BrandKitContext.Provider>
  );
}

export function useBrandKit() {
  const context = useContext(BrandKitContext);
  if (context === undefined) {
    throw new Error('useBrandKit must be used within a BrandKitProvider');
  }
  return context;
}
