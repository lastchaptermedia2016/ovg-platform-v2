"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import { BrandingData, BrandingContextState } from "@/types";

// Production Excellence defaults
const DEFAULT_BRANDING: BrandingData = {
  name: "Voice Platform",
  logoUrl: "/logo-default.svg",
  primaryColor: "#0097b2",
  accentColor: "#D4AF37",
  metaTitle: "AI Voice Platform",
  metaDescription: "Enterprise AI voice solutions",
};

interface BrandingContextType extends BrandingContextState {
  refreshBranding?: () => Promise<void>;
}

const BrandingContext = createContext<BrandingContextType>({
  branding: DEFAULT_BRANDING,
  entityType: null,
  slug: null,
  isLoading: false,
  error: null,
});

export const useBranding = () => useContext(BrandingContext);

interface BrandingProviderProps {
  children: ReactNode;
  initialData?: BrandingData;
}

/**
 * Apply branding to document (CSS variables, meta tags, favicon)
 */
function applyBrandingToDocument(branding: BrandingData): void {
  if (typeof document === "undefined") return;

  const root = document.documentElement;

  // Apply CSS variables
  root.style.setProperty("--brand-primary", branding.primaryColor);
  root.style.setProperty("--brand-accent", branding.accentColor);
  root.style.setProperty("--brand-name", `"${branding.name}"`);

  // Update meta tags
  const titleElement = document.querySelector("title");
  if (titleElement && branding.metaTitle) {
    titleElement.textContent = branding.metaTitle;
  }

  const metaDescription = document.querySelector('meta[name="description"]');
  if (metaDescription && branding.metaDescription) {
    metaDescription.setAttribute("content", branding.metaDescription);
  }

  // Update favicon if provided
  if (branding.favicon) {
    const faviconLink =
      document.querySelector('link[rel="icon"]') ||
      document.createElement("link");
    faviconLink.setAttribute("rel", "icon");
    faviconLink.setAttribute("href", branding.favicon);
    if (!document.querySelector('link[rel="icon"]')) {
      document.head.appendChild(faviconLink);
    }
  }
}

export function BrandingProvider({
  children,
  initialData,
}: BrandingProviderProps) {
  const [state, setState] = useState<BrandingContextState>({
    branding: initialData || DEFAULT_BRANDING,
    entityType: null,
    slug: null,
    isLoading: false,
    error: null,
  });

  // Initial application of branding
  useEffect(() => {
    applyBrandingToDocument(state.branding);
  }, [state.branding]);

  return (
    <BrandingContext.Provider value={state}>
      {children}
    </BrandingContext.Provider>
  );
}
