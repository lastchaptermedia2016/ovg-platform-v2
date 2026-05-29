/**
 * Supabase Realtime Alert System
 */

import { createClient } from "@/lib/supabase/client";

export type IntentType = "lead_capture" | "booking" | "question" | "complaint" | "general";

export interface AlertPayload {
  conversation_id: string;
  tenant_id: string;
  reseller_id?: string;
  trigger_word: string;
  intent_type: IntentType;
  severity: "low" | "medium" | "high" | "critical";
  message_preview: string;
  timestamp: string;
  deep_link: string;
  suggested_action: string;
  confidence: number;
}

type AlertCallback = (alert: AlertPayload) => void;

export async function broadcastIntentAlert(payload: AlertPayload): Promise<boolean> {
  try {
    const supabase = createClient();
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const insertPayload: Record<string, any> = {
      conversation_id: payload.conversation_id,
      tenant_id: payload.tenant_id,
      intent_type: payload.intent_type,
      trigger_word: payload.trigger_word,
      severity: payload.severity,
      confidence: payload.confidence,
      message_preview: payload.message_preview,
      suggested_action: payload.suggested_action,
      deep_link: payload.deep_link,
      status: "pending",
      created_at: payload.timestamp,
    };
    
    if (payload.reseller_id) {
      insertPayload.reseller_id = payload.reseller_id;
    }
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from("intent_alerts") as any).insert(insertPayload);
    
    if (error) {
      console.error("Failed to broadcast intent alert:", error);
      return false;
    }
    
    return true;
  } catch (_error) {
    console.error("Error broadcasting alert:", _error);
    return false;
  }
}

export function subscribeToResellerAlerts(
  resellerId: string,
  callback: AlertCallback
): () => void {
  const supabase = createClient();
  
  const subscription = supabase
    .channel(`reseller-alerts-${resellerId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        table: "intent_alerts" as any,
        filter: `reseller_id=eq.${resellerId}`,
      },
      (payload) => {
        const alert = payload.new as AlertPayload;
        callback(alert);
      }
    )
    .subscribe();
  
  return () => {
    subscription.unsubscribe();
  };
}

export function subscribeToAllAlerts(callback: AlertCallback): () => void {
  const supabase = createClient();
  
  const subscription = supabase
    .channel("all-intent-alerts")
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        table: "intent_alerts" as any,
      },
      (payload) => {
        const alert = payload.new as AlertPayload;
        callback(alert);
      }
    )
    .subscribe();
  
  return () => {
    subscription.unsubscribe();
  };
}

export async function acknowledgeAlert(
  alertId: string,
  agentId: string
): Promise<boolean> {
  try {
    const supabase = createClient();
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from("intent_alerts") as any)
      .update({
        status: "acknowledged",
        acknowledged_by: agentId,
        acknowledged_at: new Date().toISOString(),
      })
      .eq("id", alertId);
    
    if (error) {
      console.error("Failed to acknowledge alert:", error);
      return false;
    }
    
    return true;
  } catch (_error) {
    console.error("Error acknowledging alert:", _error);
    return false;
  }
}

export async function getRecentAlerts(
  resellerId: string,
  limit: number = 20,
  status?: "pending" | "viewed" | "acknowledged" | "resolved"
): Promise<AlertPayload[]> {
  try {
    const supabase = createClient();
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (supabase.from("intent_alerts") as any)
      .select("*")
      .eq("reseller_id", resellerId)
      .order("created_at", { ascending: false })
      .limit(limit);
    
    if (status) {
      query = query.eq("status", status);
    }
    
    const { data, error } = await query;
    
    if (error) {
      console.error("Failed to fetch recent alerts:", error);
      return [];
    }
    
    return (data || []) as AlertPayload[];
  } catch (_error) {
    console.error("Error fetching alerts:", _error);
    return [];
  }
}

export async function getPendingAlertCount(resellerId: string): Promise<number> {
  try {
    const supabase = createClient();
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count, error } = await (supabase.from("intent_alerts") as any)
      .select("*", { count: "exact", head: true })
      .eq("reseller_id", resellerId)
      .eq("status", "pending");
    
    if (error) {
      console.error("Failed to count pending alerts:", error);
      return 0;
    }
    
    return count || 0;
  } catch (_error) {
    console.error("Error counting alerts:", _error);
    return 0;
  }
}