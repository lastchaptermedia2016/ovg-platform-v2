"use server";

import { supabaseAdmin } from "@/lib/supabase/admin";

export async function getClientSettings(clientId: string) {
  const { data, error } = await supabaseAdmin
    .from("clients")
    .select("*")
    .eq("id", clientId)
    .single();

  if (error) throw error;
  return data;
}

export async function updateUI(
  clientId: string,
  uiSettings: Record<string, unknown>,
) {
  const { data, error } = await supabaseAdmin
    .from("clients")
    .update({ ui_settings: uiSettings })
    .eq("id", clientId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateAISettings(
  clientId: string,
  aiSettings: Record<string, unknown>,
) {
  const { data, error } = await supabaseAdmin
    .from("clients")
    .update({ ai_settings: aiSettings })
    .eq("id", clientId)
    .select()
    .single();

  if (error) throw error;
  return data;
}
