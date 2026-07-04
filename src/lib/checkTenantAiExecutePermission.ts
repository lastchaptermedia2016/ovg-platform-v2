import { createAuthClient } from '@/lib/auth/server';

/**
 * Check whether the AI has permission to execute actions for a given tenant.
 *
 * Looks up the canExecute flag nested inside tenants.widget_config at path:
 *   widget_config.widget_studio.aiPersona.conversationStyle.actionCapabilities.canExecute
 *
 * ⚠️ FRAGILITY WARNING: If AIPersonaSettings.tsx's save shape ever changes,
 * this JSONB path will break silently. Consider promoting canExecute to a
 * real column in the tenants table (future refactor, not in scope now).
 *
 * @param tenantId - The tenant UUID to check.
 * @returns true if canExecute is explicitly true; false otherwise (fail-closed).
 */
export async function checkTenantAiExecutePermission(tenantId: string): Promise<boolean> {
  const supabase = await createAuthClient();

  const { data, error } = await supabase
    .from('tenants')
    .select('widget_config')
    .eq('id', tenantId)
    .single();

  if (error || !data?.widget_config) {
    console.warn('[checkTenantAiExecutePermission] No widget_config found for tenant:', tenantId, error?.message);
    return false;
  }

  try {
    const widgetConfig = data.widget_config as Record<string, unknown>;
    const widgetStudio = widgetConfig.widget_studio as Record<string, unknown> | undefined;
    const aiPersona = widgetStudio?.aiPersona as Record<string, unknown> | undefined;
    const conversationStyle = aiPersona?.conversationStyle as Record<string, unknown> | undefined;
    const actionCapabilities = conversationStyle?.actionCapabilities as Record<string, unknown> | undefined;
    const canExecute = actionCapabilities?.canExecute;

    return canExecute === true;
  } catch {
    // Malformed JSONB — fail closed
    return false;
  }
}