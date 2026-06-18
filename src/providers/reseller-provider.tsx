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
          .select("id, tenant_id, name, branding_colors, accent_color, logo_url")
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

        const primaryColor =
          (reseller.branding_bag?.primaryColor as string | undefined) ??
          reseller.branding_color ??
          "#0097b2";
        const accentColor =
          (reseller.branding_bag?.accentColor as string | undefined) ??
          reseller.accent_color ??
          "#D4AF37";

        const brandingData: BrandingData = {
          name: reseller.name,
          logoUrl: reseller.logo_url || "/logo-default.svg",
          primaryColor,
          accentColor,
        };

        setBranding(brandingData);

        // Inject CSS variables immediately (flicker-free)
        if (typeof document !== "undefined") {
          const root = document.documentElement;
          root.style.setProperty("--brand-primary", brandingData.primaryColor);
          root.style.setProperty("--brand-accent", brandingData.accentColor);
          root.style.setProperty("--brand-name", `"${brandingData.name}"`);
          
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
