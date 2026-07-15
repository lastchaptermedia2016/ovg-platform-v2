import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase/admin';

export interface LogPlatformActionOptions {
  supabase: SupabaseClient;
  tenantId: string | null;
  userId: string;
  actionId: string;
  params?: Record<string, unknown>;
  result?: Record<string, unknown> | null;
  surface: 'client' | 'reseller' | 'infrastructure';
  metadata?: Record<string, unknown>;
}

export async function logPlatformAction(opts: LogPlatformActionOptions): Promise<void> {
  const {
    supabase,
    tenantId,
    userId,
    actionId,
    params,
    result,
    surface,
    metadata,
  } = opts;

  if (!tenantId) return;

  const tag = { surface };
  const mergedParams = { ...(params ?? {}), ...tag };
  const mergedMetadata = { ...(metadata ?? {}), ...tag };

  try {
    await supabase
      .from('action_logs')
      .insert({
        action_id: actionId,
        tenant_id: tenantId,
        user_id: userId,
        source: surface,
        params: mergedParams,
        result: result ?? null,
      });
  } catch (err) {
    console.error('[logPlatformAction] Failed to insert action_logs:', err);
  }

  const isConfigAction =
    actionId === 'SYSTEM_UPDATE_BRANDING' ||
    actionId === 'updateStudioConfig' ||
    actionId === 'config_update';

  if (isConfigAction) {
    try {
      await supabaseAdmin
        .from('tenant_logs')
        .insert({
          tenant_id: tenantId,
          user_id: userId,
          action: 'config_update',
          change_type: 'branding',
          old_value: {},
          new_value: result ?? params ?? {},
          delta: {},
          metadata: mergedMetadata,
        });
    } catch (err) {
      console.error('[logPlatformAction] Failed to insert tenant_logs:', err);
    }
  }
}

export async function persistChatMessage(
  supabase: SupabaseClient,
  tenantId: string | null,
  userId: string,
  text: string,
  response: { actionType: string; summary: string }
): Promise<void> {
  if (!tenantId) return;
  try {
    await supabase
      .from('chat_messages')
      .insert({
        tenant_id: tenantId,
        sender_id: userId,
        content: JSON.stringify({
          user: text,
          assistant: {
            actionType: response.actionType,
            summary: response.summary,
            surface: 'client',
          },
        }),
      });
  } catch (err) {
    console.error('[persistChatMessage] Failed to insert chat_messages:', err);
  }
}
