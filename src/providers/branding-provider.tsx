"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { BrandingData, BrandingContextState, EntityType } from "@/types";

// Default branding (neutral, no platform-specific names)
const DEFAULT_BRANDING: BrandingData = {
  name: "Voice Platform",
  logoUrl: "/logo-default.svg",
  primaryColor: "#0097b2",
  accentColor: "#D4AF37",
  metaTitle: "AI Voice Platform",
  metaDescription: "Enterprise AI voice solutions",
};

interface BrandingContextType extends BrandingContextState {
  refreshBranding: () => Promise<void>;
}

const BrandingContext = createContext<BrandingContextType>({
  branding: DEFAULT_BRANDING,
  entityType: null,
  slug: null,
  isLoading: true,
  error: null,
  refreshBranding: async () => {},
});

export const useBranding = () => useContext(BrandingContext);

interface BrandingProviderProps {
  children: ReactNode;
  initialBranding?: BrandingData;
}

/**
 * Parse URL path to determine entity type and slug
 * Handles: /reseller/[slug], /client/[slug], /dashboard (master)
 */
function parseRouteContext(pathname: string): {
  entityType: EntityType;
  slug: string | null;
} {
  const cleanPath = pathname.replace(/^\/+|\/+$/g, "");
  const segments = cleanPath.split("/");

  // Check for reseller routes: /reseller/[slug]
  if (segments[0] === "reseller" && segments[1]) {
    return { entityType: "reseller", slug: segments[1] };
  }

  // Check for client routes: /client/[slug]
  if (segments[0] === "client" && segments[1]) {
    return { entityType: "client", slug: segments[1] };
  }

  // Dashboard routes (master/admin)
  if (segments[0] === "dashboard" || segments[0] === "admin") {
    return { entityType: "master", slug: null };
  }

  return { entityType: null, slug: null };
}

/**
 * Fetch branding data from API based on entity type and slug
 */
async function fetchBranding(
  entityType: EntityType,
  slug: string | null
): Promise<BrandingData> {
  if (!entityType || !slug) {
    return DEFAULT_BRANDING;
  }

  try {
    const response = await fetch(
      `/api/branding?type=${entityType}&slug=${encodeURIComponent(slug)}`
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch branding: ${response.status}`);
    }

    const data = await response.json();
    return data.branding || DEFAULT_BRANDING;
  } catch (error) {
    console.error("Branding fetch error:", error);
    return DEFAULT_BRANDING;
  }
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
  initialBranding,
}: BrandingProviderProps) {
  const pathname = usePathname();
  const [state, setState] = useState<BrandingContextState>({
    branding: initialBranding || DEFAULT_BRANDING,
    entityType: null,
    slug: null,
    isLoading: true,
    error: null,
  });

  const refreshBranding = async () => {
    const { entityType, slug } = parseRouteContext(pathname);

    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const branding = await fetchBranding(entityType, slug);

      setState({
        branding,
        entityType,
        slug,
        isLoading: false,
        error: null,
      });

      applyBrandingToDocument(branding);
    } catch (error) {
      setState({
        branding: DEFAULT_BRANDING,
        entityType,
        slug,
        isLoading: false,
        error:
          error instanceof Error ? error.message : "Failed to load branding",
      });
    }
  };

  // Fetch branding when pathname changes
  useEffect(() => {
    refreshBranding();
  }, [pathname]);

  // Initial application of branding
  useEffect(() => {
    applyBrandingToDocument(state.branding);
  }, [state.branding]);

  return (
    <BrandingContext.Provider value={{ ...state, refreshBranding }}>
      {children}
    </BrandingContext.Provider>
  );
}
