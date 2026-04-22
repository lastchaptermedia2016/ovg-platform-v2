"use server";

import { supabaseAdmin } from "@/lib/supabase/admin";

export async function getClients(resellerId: string) {
  const { data, error } = await supabaseAdmin
    .from("clients")
    .select("*")
    .eq("reseller_id", resellerId);

  if (error) throw error;
  return data;
}

export async function getClientById(clientId: string) {
  const { data, error } = await supabaseAdmin
    .from("clients")
    .select("*")
    .eq("id", clientId)
    .single();

  if (error) throw error;
  return data;
}

export async function updateClientSettings(
  clientId: string,
  settings: Record<string, unknown>,
) {
  const { data, error } = await supabaseAdmin
    .from("clients")
    .update(settings)
    .eq("id", clientId)
    .select()
    .single();

  if (error) throw error;
  return data;
}
