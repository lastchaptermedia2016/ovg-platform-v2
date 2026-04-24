"use server";

import { EntityType, RouteContext, BrandingData, Reseller, Client } from "@/types";

// Default master branding (fallback)
const DEFAULT_BRANDING: BrandingData = {
  name: "Voice Platform",
  logoUrl: "/logo-default.svg",
  primaryColor: "#0097b2",
  accentColor: "#D4AF37",
  metaTitle: "AI Voice Platform",
  metaDescription: "Enterprise AI voice solutions",
};

/**
 * Parse URL path to determine entity type and slug
 * Handles: /reseller/[slug], /client/[slug], /dashboard (master)
 */
export async function parseRouteContext(pathname: string): Promise<{
  entityType: EntityType;
  slug: string | null;
}> {
  // Remove leading and trailing slashes
  const cleanPath = pathname.replace(/^\/+|\/+$/g, "");
  const segments = cleanPath.split("/");

  // Check for reseller routes: /reseller/[slug]
  if (segments[0] === "reseller" && segments[1]) {
    return {
      entityType: "reseller",
      slug: segments[1],
    };
  }

  // Check for client routes: /client/[slug]
  if (segments[0] === "client" && segments[1]) {
    return {
      entityType: "client",
      slug: segments[1],
    };
  }

  // Dashboard routes (master/admin)
  if (segments[0] === "dashboard" || segments[0] === "admin") {
    return {
      entityType: "master",
      slug: null,
    };
  }

  // Default: no specific entity
  return {
    entityType: null,
    slug: null,
  };
}

/**
 * Mock database fetch - replace with actual Supabase calls
 * TODO: Implement actual database queries
 */
async function fetchResellerBySlug(slug: string): Promise<Reseller | null> {
  // TODO: Replace with actual Supabase query
  // const { data } = await supabase
  //   .from('resellers')
  //   .select('*')
  //   .eq('slug', slug)
  //   .single();

  // Mock data for demonstration
  if (slug === "acme-corp") {
    return {
      id: "res-001",
      slug: "acme-corp",
      name: "Acme Corp",
      email: "admin@acme.com",
      is_active: true,
      branding: {
        name: "Acme Voice Solutions",
        logoUrl: "/logos/acme-corp.svg",
        primaryColor: "#E74C3C",
        accentColor: "#F39C12",
        metaTitle: "Acme Voice - AI Solutions",
        metaDescription: "Powered by Acme Corp",
      },
      branding_colors: {
        primary: "#0097b2",
        secondary: "#226683",
      },
      branding_assets: {
        header_url: "/header.png",
        footer_url: "/footer.png",
      },
      pricing_tiers: {
        standard: "price_123",
        premium: "price_456",
      },
    };
  }

  return null;
}

/**
 * Mock database fetch - replace with actual Supabase calls
 * TODO: Implement actual database queries
 */
async function fetchClientBySlug(slug: string): Promise<Client | null> {
  // TODO: Replace with actual Supabase query
  // const { data } = await supabase
  //   .from('clients')
  //   .select('*, reseller:reseller_id(*)')
  //   .eq('slug', slug)
  //   .single();

  // Mock data for demonstration
  if (slug === "local-gym") {
    return {
      id: "cli-001",
      slug: "local-gym",
      name: "PowerFit Gym",
      email: "owner@powerfit.com",
      reseller_id: "res-001",
      reseller_slug: "acme-corp",
      branding: {
        name: "PowerFit Gym",
        logoUrl: "/logos/local-gym.svg",
        primaryColor: "#27AE60",
        accentColor: "#E74C3C",
      },
    };
  }

  return null;
}

/**
 * Resolve branding based on route context
 * For clients: falls back to parent reseller branding if client has none
 */
export async function resolveBranding(
  entityType: EntityType,
  slug: string | null
): Promise<RouteContext> {
  // Master/default branding
  if (entityType === "master" || !entityType || !slug) {
    return {
      entityType: entityType || "master",
      slug: null,
      branding: DEFAULT_BRANDING,
    };
  }

  // Reseller branding
  if (entityType === "reseller") {
    const reseller = await fetchResellerBySlug(slug);

    if (!reseller || !reseller.is_active) {
      return {
        entityType: null,
        slug: null,
        branding: DEFAULT_BRANDING,
      };
    }

    return {
      entityType: "reseller",
      slug,
      branding: reseller.branding || DEFAULT_BRANDING,
    };
  }

  // Client branding - check for client-specific, fall back to reseller
  if (entityType === "client") {
    const client = await fetchClientBySlug(slug);

    if (!client) {
      return {
        entityType: null,
        slug: null,
        branding: DEFAULT_BRANDING,
      };
    }

    // If client has branding, use it
    if (client.branding) {
      return {
        entityType: "client",
        slug,
        branding: client.branding,
        parentReseller: null, // Could fetch if needed
      };
    }

    // Otherwise, fetch parent reseller branding
    if (client.reseller_slug) {
      const reseller = await fetchResellerBySlug(client.reseller_slug);

      if (reseller?.branding) {
        return {
          entityType: "client",
          slug,
          branding: {
            ...reseller.branding,
            name: client.name, // Client keeps their own name
          },
          parentReseller: reseller,
        };
      }
    }

    // Fallback to default with client name
    return {
      entityType: "client",
      slug,
      branding: {
        ...DEFAULT_BRANDING,
        name: client.name,
      },
    };
  }

  // Fallback
  return {
    entityType: null,
    slug: null,
    branding: DEFAULT_BRANDING,
  };
}

/**
 * Server-side helper to get full route context from request
 */
export async function getRouteContext(
  pathname: string
): Promise<RouteContext> {
  const { entityType, slug } = await parseRouteContext(pathname);
  return resolveBranding(entityType, slug);
}
