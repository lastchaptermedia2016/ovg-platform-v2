"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase";
import { Reseller, BrandingData } from "@/types";

interface UseResellerReturn {
  reseller: Reseller | null;
  branding: BrandingData | null;
  isLoading: boolean;
  error: string | null;
  refreshReseller: () => Promise<void>;
}

/**
 * useReseller Hook
 * 
 * Fetches reseller data and branding from Supabase based on the logged-in user's metadata.
 * This hook is used in the reseller dashboard to display the correct branding.
 */
export function useReseller(): UseResellerReturn {
  const [reseller, setReseller] = useState<Reseller | null>(null);
  const [branding, setBranding] = useState<BrandingData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchReseller = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const supabase = createClient();

      // Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser();

      if (userError || !user) {
        setError("Not authenticated");
        setIsLoading(false);
        return;
      }

      // Get reseller ID from user metadata
      const resellerId = user.user_metadata?.reseller_id;
      const resellerSlug = user.user_metadata?.reseller_slug;

      console.log("🔍 useReseller - User metadata:", {
        resellerId,
        resellerSlug,
        email: user.email,
      });

      if (!resellerId && !resellerSlug) {
        // Fallback to Acme Corp for development
        console.log("⚠️ No reseller in metadata, using fallback");
        const fallbackReseller = await fetchResellerBySlug("acme-corp");
        if (fallbackReseller) {
          setReseller(fallbackReseller);
          setBranding(fallbackReseller.branding || null);
        }
        setIsLoading(false);
        return;
      }

      // Fetch reseller from database
      let resellerData: Reseller | null = null;

      if (resellerId) {
        resellerData = await fetchResellerById(resellerId);
      } else if (resellerSlug) {
        resellerData = await fetchResellerBySlug(resellerSlug);
      }

      if (resellerData) {
        console.log("✅ Reseller loaded:", resellerData.name);
        setReseller(resellerData);
        setBranding(resellerData.branding || null);
      } else {
        setError("Reseller not found");
      }
    } catch (err) {
      console.error("useReseller error:", err);
      setError(err instanceof Error ? err.message : "Failed to load reseller");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReseller();
  }, [fetchReseller]);

  return {
    reseller,
    branding,
    isLoading,
    error,
    refreshReseller: fetchReseller,
  };
}

/**
 * Fetch reseller by ID
 */
async function fetchResellerById(id: string): Promise<Reseller | null> {
  const supabase = createClient();
  
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
  const supabase = createClient();
  
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
