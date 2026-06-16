"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";

// ──────────────────────────────────────────────
// Double-lock ownership verification helper
// Resolves tenant and validates user has access to that reseller
// ──────────────────────────────────────────────
async function validateClientOwnership(
  userId: string,
  clientId: string,
): Promise<string | null> {
  const supabase = await createServerClient();

  // Resolve tenant to get its reseller_id
  const { data: tenant, error } = await supabase
    .from("tenants")
    .select("reseller_id")
    .eq("id", clientId)
    .single();

  if (error || !tenant?.reseller_id) {
    return null;
  }

  // Verify user has access to this reseller via user_resellers junction
  const { data: userReseller } = await supabase
    .from("user_resellers")
    .select("reseller_id")
    .eq("user_id", userId)
    .eq("reseller_id", tenant.reseller_id)
    .maybeSingle();

  if (!userReseller) {
    return null;
  }

  return tenant.reseller_id;
}

export async function getClientSettings(clientId: string) {
  const supabase = await createServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error("Unauthenticated server execution context");
  }

  // Verify ownership before querying
  const resellerId = await validateClientOwnership(user.id, clientId);

  if (!resellerId) {
    throw new Error("Access denied - client not found or not owned");
  }

  const { data, error } = await supabase
    .from("tenants")
    .select("*")
    .eq("id", clientId)
    .eq("reseller_id", resellerId)
    .single();

  if (error) throw error;
  return data;
}

export async function updateUI(
  clientId: string,
  uiSettings: Record<string, unknown>,
) {
  const supabase = await createServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return { success: false, error: "Unauthenticated server execution context" };
  }

  // Verify ownership before updating
  const resellerId = await validateClientOwnership(user.id, clientId);

  if (!resellerId) {
    return { success: false, error: "Access denied - client not found or not owned" };
  }

  const { data, error } = await supabase
    .from("tenants")
    .update({ ui_settings: uiSettings })
    .eq("id", clientId)
    .eq("reseller_id", resellerId)
    .select()
    .single();

  if (error) {
    return { success: false, error: error.message };
  }
  return { success: true, data };
}

export async function updateAISettings(
  clientId: string,
  aiSettings: Record<string, unknown>,
) {
  const supabase = await createServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return { success: false, error: "Unauthenticated server execution context" };
  }

  // Verify ownership before updating
  const resellerId = await validateClientOwnership(user.id, clientId);

  if (!resellerId) {
    return { success: false, error: "Access denied - client not found or not owned" };
  }

  const { data, error } = await supabase
    .from("tenants")
    .update({ ai_settings: aiSettings })
    .eq("id", clientId)
    .eq("reseller_id", resellerId)
    .select()
    .single();

  if (error) {
    return { success: false, error: error.message };
  }
  return { success: true, data };
}