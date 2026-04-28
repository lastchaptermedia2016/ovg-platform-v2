'use client';

import { createContext, useContext, ReactNode, useState } from 'react';

interface BrandKitContextType {
  headerUrl: string | null;
  setHeaderUrl: (url: string | null) => void;
  footerUrl: string | null;
  setFooterUrl: (url: string | null) => void;
  template?: string;
  botPersonality?: string;
  primaryColor?: string;
  secondaryColor?: string;
}

const BrandKitContext = createContext<BrandKitContextType | undefined>(undefined);

export function useBrandKit() {
  const context = useContext(BrandKitContext);
  if (context === undefined) {
    throw new Error('useBrandKit must be used within a BrandKitProvider');
  }
  return context;
}

interface BrandKitProviderProps {
  children: ReactNode;
}

export function BrandKitProvider({ children }: BrandKitProviderProps) {
  const [headerUrl, setHeaderUrl] = useState<string | null>(null);
  const [footerUrl, setFooterUrl] = useState<string | null>(null);
  const [template, setTemplate] = useState<string>('default');
  const [botPersonality, setBotPersonality] = useState<string>('informational');
  const [primaryColor, setPrimaryColor] = useState<string>('#0097b2');
  const [secondaryColor, setSecondaryColor] = useState<string>('#D4AF37');

  const value: BrandKitContextType = {
    headerUrl,
    setHeaderUrl,
    footerUrl,
    setFooterUrl,
    template,
    botPersonality,
    primaryColor,
    secondaryColor
  };

  return (
    <BrandKitContext.Provider value={value}>
      {children}
    </BrandKitContext.Provider>
  );
}
