"use client";

import { useState, useCallback, useEffect } from "react";
import { createBrowserClient } from "@/lib/supabase";
import { Reseller, BrandingData } from "@/types";

interface UseResellerReturn {
  reseller: Reseller | null;
  branding: BrandingData | null;
  isLoading: boolean;
  error: string | null;
  refreshReseller: () => Promise<void>;
}

export function useReseller(): UseResellerReturn {
  const [reseller, setReseller] = useState<Reseller | null>(null);
  const [branding, setBranding] = useState<BrandingData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchReseller = useCallback(async () => {
    try {
      const supabase = createBrowserClient();
      const { data: { user }, error: userError } = await supabase.auth.getUser();

      if (userError || !user) {
        setError("Not authenticated");
        return; // Finally block handles setIsLoading(false)
      }

      // Authoritative Resolution: Fetch link from user_resellers (P0 Security)
      // Metadata is forgeable; the junction table is the source of truth.
      const { data: link, error: linkError } = await supabase
        .from("user_resellers")
        .select("reseller_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (linkError || !link) {
        console.error("[useReseller] No reseller link found for user:", user.id);
        setError("Your account is not linked to a reseller.");
        return;
      }

      // Fetch detailed Reseller information
      const { data: resellerData, error: resellerError } = await supabase
        .from("resellers")
        .select("*")
        .eq("id", link.reseller_id)
        .eq("is_active", true)
        .maybeSingle();

      if (resellerError || !resellerData) {
        console.error("[useReseller] Reseller lookup failed:", resellerError);
        setError("Reseller not found");
        return;
      }

      setReseller(resellerData as Reseller);
      setBranding((resellerData as Reseller).branding || null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load reseller";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let isActive = true;

    // Microtask deferral prevents synchronous setState warnings in strict mode
    Promise.resolve().then(() => {
      if (isActive) {
        setError(null);
        setIsLoading(true);
        void fetchReseller();
      }
    });

    return () => {
      isActive = false;
    };
  }, [fetchReseller]);

  return {
    reseller,
    branding,
    isLoading,
    error,
    refreshReseller: fetchReseller,
  };
}