"use client";

import { useBranding } from "@/providers/branding-provider";
import Link from "next/link";

/**
 * BrandedHeader - Dynamic header that displays reseller/client branding
 * No hardcoded references - all data comes from BrandingProvider
 */
export function BrandedHeader() {
  const { branding, entityType, slug, isLoading } = useBranding();

  // Build dashboard link based on entity type
  const getDashboardHref = () => {
    if (entityType === "reseller" && slug) {
      return `/reseller/${slug}/dashboard`;
    }
    if (entityType === "client" && slug) {
      return `/client/${slug}/dashboard`;
    }
    return "/dashboard";
  };

  if (isLoading) {
    return (
      <header className="border-b px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded bg-gray-200 animate-pulse" />
          <div className="h-4 w-32 rounded bg-gray-200 animate-pulse" />
        </div>
      </header>
    );
  }

  return (
    <header
      className="border-b px-4 py-3"
      style={{
        borderColor: "var(--brand-accent)",
        backgroundColor: `${branding.primaryColor}10`, // 10% opacity
      }}
    >
      <div className="flex items-center justify-between max-w-7xl mx-auto">
        {/* Logo and Brand Name */}
        <Link
          href={getDashboardHref()}
          className="flex items-center gap-3 hover:opacity-80 transition-opacity"
        >
          {/* Dynamic Logo */}
          <img
            src={branding.logoUrl}
            alt={`${branding.name} logo`}
            className="h-8 w-auto object-contain"
            onError={(e) => {
              // Fallback to colored circle if logo fails to load
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />

          {/* Brand Name */}
          <span
            className="font-bold text-lg"
            style={{ color: branding.primaryColor }}
          >
            {branding.name}
          </span>
        </Link>

        {/* Optional: Entity Type Badge */}
        {entityType && entityType !== "master" && (
          <span
            className="text-xs px-2 py-1 rounded-full"
            style={{
              backgroundColor: `${branding.accentColor}20`,
              color: branding.accentColor,
            }}
          >
            {entityType === "reseller" ? "Reseller Portal" : "Client Dashboard"}
          </span>
        )}
      </div>
    </header>
  );
}

/**
 * BrandedFooter - Dynamic footer using branding context
 */
export function BrandedFooter() {
  const { branding } = useBranding();

  return (
    <footer className="border-t py-4 px-4 mt-auto">
      <div className="max-w-7xl mx-auto flex items-center justify-between text-sm text-gray-500">
        <span>
          © {new Date().getFullYear()} {branding.name}. All rights reserved.
        </span>
        <span
          className="font-medium"
          style={{ color: branding.primaryColor }}
        >
          Powered by Voice Platform
        </span>
      </div>
    </footer>
  );
}
