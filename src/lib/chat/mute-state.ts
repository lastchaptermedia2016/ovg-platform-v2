import { supabaseAdmin } from '@/lib/supabase/admin';

export interface ApplyMuteStateOptions {
  conversationId: string;
  tenantId: string;
  isAiMuted: boolean;
  isHumanTakingOver: boolean;
  humanAgentId?: string | null;
  handoverInitiatedAt?: string | null;
  autoReenableAi?: boolean;
  reenableAfterMinutes?: number;
  scheduledReenableAt?: string | null;
}

export async function applyMuteState(options: ApplyMuteStateOptions) {
  const {
    conversationId,
    tenantId,
    isAiMuted,
    isHumanTakingOver,
    humanAgentId = null,
    handoverInitiatedAt = null,
    autoReenableAi = false,
    reenableAfterMinutes = 30,
    scheduledReenableAt = null,
  } = options;

  const payload: Record<string, unknown> = {
    conversation_id: conversationId,
    tenant_id: tenantId,
    is_ai_muted: isAiMuted,
    is_human_taking_over: isHumanTakingOver,
    auto_reenable_ai: autoReenableAi,
    reenable_after_minutes: reenableAfterMinutes,
    scheduled_reenable_at: scheduledReenableAt,
  };

  if (humanAgentId) payload.human_agent_id = humanAgentId;
  if (handoverInitiatedAt) payload.handover_initiated_at = handoverInitiatedAt;

  const { error } = await supabaseAdmin
    .from('conversation_mute_state')
    .upsert(payload, { onConflict: 'conversation_id' });

  if (error) {
    console.error('[applyMuteState] failed:', error);
    throw error;
  }
}
