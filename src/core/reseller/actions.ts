"use server";

import { createClient } from "@/lib/supabase/server";
import { getResellerBySlug, getResellerClients, getResellerClientCount } from "./queries";

// ──────────────────────────────────────────────
// Resolve the acting user's reseller context
// ──────────────────────────────────────────────
async function getUserResellerId(): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: userReseller } = await supabase
    .from("user_resellers")
    .select("reseller_id")
    .eq("user_id", user.id)
    .maybeSingle();

  return userReseller?.reseller_id ?? null;
}

export async function getResellerData(resellerSlug: string) {
  // Verify user has access to this reseller before proceeding
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Unauthenticated server execution context");
  }

  // Get the requested reseller and verify ownership
  const reseller = await getResellerBySlug(resellerSlug);

  if (!reseller) {
    return null;
  }

  // Verify user belongs to this reseller via junction table
  const { data: userReseller } = await supabase
    .from("user_resellers")
    .select("reseller_id")
    .eq("user_id", user.id)
    .eq("reseller_id", reseller.id)
    .maybeSingle();

  if (!userReseller) {
    throw new Error("Access denied to requested reseller");
  }

  const [clients, clientCount] = await Promise.all([
    getResellerClients(reseller.id),
    getResellerClientCount(reseller.id),
  ]);

  return {
    reseller,
    clients,
    clientCount,
  };
}

export async function getClients(resellerId: string) {
  const userResellerId = await getUserResellerId();

  if (!userResellerId) {
    throw new Error("Unauthenticated server execution context");
  }

  // Ensure the requested resellerId matches the user's reseller
  if (userResellerId !== resellerId) {
    throw new Error("Access denied - reseller mismatch");
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("tenants")
    .select("*")
    .eq("reseller_id", resellerId);

  if (error) throw error;
  return data;
}

export async function getClientById(clientId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Unauthenticated server execution context");
  }

  // First resolve tenant to get reseller_id for ownership verification
  const { data: tenant, error: fetchError } = await supabase
    .from("tenants")
    .select("reseller_id")
    .eq("id", clientId)
    .single();

  if (fetchError || !tenant) {
    return null;
  }

  // Verify user has access to this tenant's reseller
  const { data: userReseller } = await supabase
    .from("user_resellers")
    .select("reseller_id")
    .eq("user_id", user.id)
    .eq("reseller_id", tenant.reseller_id)
    .maybeSingle();

  if (!userReseller) {
    return null;
  }

  const { data, error } = await supabase
    .from("tenants")
    .select("*")
    .eq("id", clientId)
    .eq("reseller_id", tenant.reseller_id)
    .single();

  if (error) throw error;
  return data;
}

export async function updateClientSettings(
  clientId: string,
  settings: Record<string, unknown>,
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Unauthenticated server execution context" };
  }

  // First resolve tenant to get reseller_id for ownership verification
  const { data: tenant, error: fetchError } = await supabase
    .from("tenants")
    .select("reseller_id")
    .eq("id", clientId)
    .single();

  if (fetchError || !tenant) {
    return { success: false, error: "Client not found" };
  }

  // Verify user has access to this tenant's reseller
  const { data: userReseller } = await supabase
    .from("user_resellers")
    .select("reseller_id")
    .eq("user_id", user.id)
    .eq("reseller_id", tenant.reseller_id)
    .maybeSingle();

  if (!userReseller) {
    return { success: false, error: "Access denied" };
  }

  const { data, error } = await supabase
    .from("tenants")
    .update(settings)
    .eq("id", clientId)
    .eq("reseller_id", tenant.reseller_id)
    .select()
    .single();

  if (error) {
    return { success: false, error: error.message };
  }
  return { success: true, data };
}