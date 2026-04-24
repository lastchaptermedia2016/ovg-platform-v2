/**
 * AI Mute Mechanism
 * 
 * Manages the state when a human agent takes over a conversation.
 * When muted, the AI will not auto-reply to user messages.
 */

import { createClient } from "@supabase/supabase-js";

export interface MuteState {
  conversation_id: string;
  tenant_id: string;
  is_ai_muted: boolean;
  is_human_taking_over: boolean;
  human_agent_id?: string;
  human_agent_name?: string;
  handover_reason?: string;
  handover_initiated_at?: string;
  auto_reenable_ai: boolean;
  reenable_after_minutes: number;
  scheduled_reenable_at?: string;
}

// Supabase client (singleton)
let supabaseClient: ReturnType<typeof createClient> | null = null;

function getSupabaseClient() {
  if (!supabaseClient) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error("Missing Supabase environment variables");
    }
    
    supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
  }
  return supabaseClient;
}

/**
 * Check if AI should be muted for a conversation
 * Call this before sending any AI response
 */
export async function checkAIMuteState(conversationId: string): Promise<MuteState | null> {
  try {
    const supabase = getSupabaseClient();
    
    const { data, error } = await supabase
      .from("conversation_mute_state")
      .select("*")
      .eq("conversation_id", conversationId)
      .single();
    
    if (error) {
      // No mute state found = AI is not muted
      if (error.code === "PGRST116") {
        return null;
      }
      console.error("Error checking mute state:", error);
      return null;
    }
    
    // Check if scheduled re-enable time has passed
    if (data.is_ai_muted && data.scheduled_reenable_at) {
      const reenableTime = new Date(data.scheduled_reenable_at);
      if (reenableTime <= new Date()) {
        // Auto re-enable AI
        await unmuteAI(conversationId);
        return {
          ...data,
          is_ai_muted: false,
          is_human_taking_over: false,
        };
      }
    }
    
    return data as MuteState;
  } catch (error) {
    console.error("Error in checkAIMuteState:", error);
    return null;
  }
}

/**
 * Mute AI and enable human takeover
 */
export async function muteAI(
  conversationId: string,
  tenantId: string,
  humanAgentId: string,
  humanAgentName: string,
  handoverReason: string,
  options?: {
    autoReenable?: boolean;
    reenableAfterMinutes?: number;
  }
): Promise<boolean> {
  try {
    const supabase = getSupabaseClient();
    
    const reenableAfterMinutes = options?.reenableAfterMinutes || 30;
    const scheduledReenableAt = options?.autoReenable !== false
      ? new Date(Date.now() + reenableAfterMinutes * 60000).toISOString()
      : null;
    
    const { error } = await supabase
      .from("conversation_mute_state")
      .upsert(
        {
          conversation_id: conversationId,
          tenant_id: tenantId,
          is_ai_muted: true,
          is_human_taking_over: true,
          human_agent_id: humanAgentId,
          human_agent_name: humanAgentName,
          handover_reason: handoverReason,
          handover_initiated_at: new Date().toISOString(),
          auto_reenable_ai: options?.autoReenable !== false,
          reenable_after_minutes: reenableAfterMinutes,
          scheduled_reenable_at: scheduledReenableAt,
        },
        { onConflict: "conversation_id" }
      );
    
    if (error) {
      console.error("Failed to mute AI:", error);
      return false;
    }
    
    console.log(`🤖 AI muted for conversation ${conversationId}. Human ${humanAgentName} taking over.`);
    
    return true;
  } catch (error) {
    console.error("Error muting AI:", error);
    return false;
  }
}

/**
 * Unmute AI and return control to AI
 */
export async function unmuteAI(conversationId: string): Promise<boolean> {
  try {
    const supabase = getSupabaseClient();
    
    const { error } = await supabase
      .from("conversation_mute_state")
      .upsert(
        {
          conversation_id: conversationId,
          is_ai_muted: false,
          is_human_taking_over: false,
          human_agent_id: null,
          human_agent_name: null,
          scheduled_reenable_at: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "conversation_id" }
      );
    
    if (error) {
      console.error("Failed to unmute AI:", error);
      return false;
    }
    
    console.log(`🤖 AI unmuted for conversation ${conversationId}`);
    
    return true;
  } catch (error) {
    console.error("Error unmuting AI:", error);
    return false;
  }
}

/**
 * Extend mute duration (human agent staying in control longer)
 */
export async function extendMuteDuration(
  conversationId: string,
  additionalMinutes: number = 30
): Promise<boolean> {
  try {
    const supabase = getSupabaseClient();
    
    // Get current state
    const { data, error: fetchError } = await supabase
      .from("conversation_mute_state")
      .select("*")
      .eq("conversation_id", conversationId)
      .single();
    
    if (fetchError || !data) {
      console.error("Failed to fetch mute state for extension:", fetchError);
      return false;
    }
    
    const newReenableAt = new Date(Date.now() + additionalMinutes * 60000).toISOString();
    
    const { error } = await supabase
      .from("conversation_mute_state")
      .update({
        scheduled_reenable_at: newReenableAt,
        reenable_after_minutes: data.reenable_after_minutes + additionalMinutes,
        updated_at: new Date().toISOString(),
      })
      .eq("conversation_id", conversationId);
    
    if (error) {
      console.error("Failed to extend mute duration:", error);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error("Error extending mute duration:", error);
    return false;
  }
}

/**
 * Get active muted conversations for a tenant
 */
export async function getMutedConversations(tenantId: string): Promise<MuteState[]> {
  try {
    const supabase = getSupabaseClient();
    
    const { data, error } = await supabase
      .from("conversation_mute_state")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("is_ai_muted", true);
    
    if (error) {
      console.error("Failed to fetch muted conversations:", error);
      return [];
    }
    
    return (data || []) as MuteState[];
  } catch (error) {
    console.error("Error fetching muted conversations:", error);
    return [];
  }
}

/**
 * Should AI respond? Main check function for chat widget
 */
export async function shouldAIRespond(conversationId: string): Promise<boolean> {
  const muteState = await checkAIMuteState(conversationId);
  
  // If no mute state, AI can respond
  if (!muteState) return true;
  
  // If muted, AI should not respond
  return !muteState.is_ai_muted;
}
