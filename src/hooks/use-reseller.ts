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

/**
 * Fetch reseller by ID
 */
async function fetchResellerById(id: string): Promise<Reseller | null> {
  const supabase = createBrowserClient();
  const { data, error } = await supabase
    .from("resellers")
    .select("*")
    .eq("id", id)
    .eq("is_active", true)
    .single();

  if (error || !data) {
    console.error("fetchResellerById error:", error);
    return null;
  }
  return data as Reseller;
}

/**
 * Fetch reseller by slug (tenant_id)
 */
async function fetchResellerBySlug(slug: string): Promise<Reseller | null> {
  const supabase = createBrowserClient();
  const { data, error } = await supabase
    .from("resellers")
    .select("*")
    .eq("tenant_id", slug)
    .eq("is_active", true)
    .single();

  if (error || !data) {
    console.error("fetchResellerBySlug error:", error);
    return null;
  }
  return data as Reseller;
}

export function useReseller(): UseResellerReturn {
  const [reseller, setReseller] = useState<Reseller | null>(null);
  const [branding, setBranding] = useState<BrandingData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 1. Stabilize fetchReseller with useCallback
  const fetchReseller = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const supabase = createBrowserClient();
      const { data: { user }, error: userError } = await supabase.auth.getUser();

      if (userError || !user) {
        setError("Not authenticated");
        return; // Finally block handles setIsLoading(false)
      }

      const resellerId = user.user_metadata?.reseller_id;
      const resellerSlug = user.user_metadata?.reseller_slug;

      if (!resellerId && !resellerSlug) {
        const fallbackReseller = await fetchResellerBySlug("acme-corp");
        if (fallbackReseller) {
          setReseller(fallbackReseller);
          setBranding(fallbackReseller.branding || null);
        }
        return;
      }

      let resellerData: Reseller | null = null;
      if (resellerId) {
        resellerData = await fetchResellerById(resellerId);
      } else if (resellerSlug) {
        resellerData = await fetchResellerBySlug(resellerSlug);
      }

      if (resellerData) {
        setReseller(resellerData);
        setBranding(resellerData.branding || null);
      } else {
        setError("Reseller not found");
      }
    } catch (err) {
      // 2. Logic fix: Using the error correctly instead of a suppressed _err
      const message = err instanceof Error ? err.message : "Failed to load reseller";
      setError(message);
    } finally {
      // 3. Ensuring state is updated outside the immediate effect execution
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let isActive = true;

    Promise.resolve().then(() => {
      if (isActive) {
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