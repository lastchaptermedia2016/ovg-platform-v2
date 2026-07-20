"use client";

import { useEffect, useState, ReactNode } from "react";
import { createBrowserClient } from "@/lib/supabase";
import { BrandingData } from "@/types";
import type { ResellerRecord } from "@/types/database";

interface ResellerProviderProps {
  children: ReactNode;
  resellerSlug: string;
}

export function ResellerProvider({ 
  children, 
  resellerSlug 
}: ResellerProviderProps) {
  const [branding, setBranding] = useState<BrandingData | null>(null);
  const [_isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchResellerBranding() {
      // Hydration Guard: skip until real slug is ready
      if (!resellerSlug || resellerSlug.startsWith('[') || resellerSlug === 'undefined') {
        setIsLoading(false);
        return;
      }

      try {
        const supabase = createBrowserClient();
        
        const { data, error } = await supabase
          .from("resellers")
          .select("id, tenant_id, name, branding_colors, branding_assets, logo_url")
          .eq("tenant_id", resellerSlug)
          .eq("is_active", true)
          .single();

        if (error || !data) {
          console.error("Failed to fetch reseller branding");
          // Fallback to default branding
          setBranding({
            name: "Voice Platform",
            logoUrl: "/logo-default.svg",
            primaryColor: "#0097b2",
            accentColor: "#D4AF37",
          });
          return;
        }

        const reseller = data as unknown as ResellerRecord;
        const colors = (reseller.branding_colors ?? null) as Record<string, unknown> | null;
        const assets = (reseller.branding_assets ?? null) as Record<string, unknown> | null;

        const primaryColor =
          (colors?.primary as string | undefined) ??
          (colors?.primaryColor as string | undefined) ??
          "#0097b2";
        const accentColor =
          (colors?.secondary as string | undefined) ??
          (colors?.accentColor as string | undefined) ??
          "#D4AF37";

        const brandingData: BrandingData = {
          name: reseller.name,
          logoUrl:
            (assets?.logo_url as string | undefined) ??
            (assets?.logoUrl as string | undefined) ??
            (reseller.logo_url || "/logo-default.svg"),
          primaryColor,
          accentColor,
        };

        setBranding(brandingData);

        // Inject CSS variables immediately (flicker-free). We bridge the
        // reseller's JSONB `branding_colors` onto BOTH the legacy
        // `--brand-*` set and the active `--w-*` set consumed by the
        // ChatWidget / Zeeder UI, so the database-driven reseller theme
        // actually reaches the widget surface.
        if (typeof document !== "undefined") {
          const root = document.documentElement;
          root.style.setProperty("--brand-primary", brandingData.primaryColor);
          root.style.setProperty("--brand-accent", brandingData.accentColor);
          root.style.setProperty("--brand-name", `"${brandingData.name}"`);
          root.style.setProperty("--w-primary", brandingData.primaryColor);
          root.style.setProperty("--w-accent", brandingData.accentColor);
        }
      } catch (error) {
        console.error("Error fetching reseller branding:", error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchResellerBranding();
  }, [resellerSlug]);

  // Initialize Supabase Realtime for Sales Tapper alerts
  useEffect(() => {
    // Hydration Guard: skip subscription until real slug is ready
    if (!resellerSlug || resellerSlug.startsWith('[') || resellerSlug === 'undefined') {
      return;
    }

    if (!branding) return;

    const supabase = createBrowserClient();
    const channel = supabase
      .channel(`reseller-alerts-${resellerSlug}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "intent_alerts",
          filter: `reseller_id=eq.${resellerSlug}`,
        },
        (payload) => {
          console.log("🚨 New intent alert received:", payload);
          // Dispatch custom event for notification center
          window.dispatchEvent(new CustomEvent("intent-alert", { detail: payload.new }));
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [branding, resellerSlug]);

  return <>{children}</>;
}
