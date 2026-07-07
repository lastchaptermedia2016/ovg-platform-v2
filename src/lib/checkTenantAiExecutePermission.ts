import { createAuthClient } from '@/lib/auth/server';

/**
 * Check whether the AI has permission to execute actions for a given tenant.
 *
 * Primary read path (canonical):
 *   widget_config.aiPersona.conversationStyle.actionCapabilities.canExecute
 *
 * Fallback read path (deprecation window only):
 *   widget_config.widget_studio.aiPersona.conversationStyle.actionCapabilities.canExecute
 *
 * ⚠️ FRAGILITY WARNING: If AIPersonaSettings.tsx's save shape ever changes,
 * this JSONB path will break silently. Consider promoting canExecute to a
 * real column in the tenants table (future refactor, not in scope now).
 *
 * @param tenantId - The tenant UUID to check.
 * @returns true if canExecute is explicitly true; false otherwise (fail-closed).
 */
function readCanExecute(widgetConfig: Record<string, unknown>, tenantId: string): boolean {
  const readFrom = (persona: Record<string, unknown> | undefined): boolean => {
    if (!persona) return false;
    const conversationStyle = persona.conversationStyle as
      | Record<string, unknown>
      | string
      | undefined;
    if (typeof conversationStyle === 'object' && conversationStyle !== null) {
      const actionCapabilities = conversationStyle.actionCapabilities as
        | Record<string, unknown>
        | undefined;
      if (actionCapabilities?.canExecute === true) return true;
    }
    const topLevel = persona.actionCapabilities as Record<string, unknown> | undefined;
    return topLevel?.canExecute === true;
  };

  // Canonical path (client portal + reseller portal)
  const canonicalPersona = widgetConfig.aiPersona as Record<string, unknown> | undefined;
  if (readFrom(canonicalPersona)) return true;

  // Legacy fallback during deprecation window
  const widgetStudio = widgetConfig.widget_studio as Record<string, unknown> | undefined;
  const legacyPersona = widgetStudio?.aiPersona as Record<string, unknown> | undefined;
  if (readFrom(legacyPersona)) {
    console.warn(
      '[checkTenantAiExecutePermission] LEGACY widget_studio fallback hit for tenant:',
      tenantId
    );
    return true;
  }

  return false;
}

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
    return readCanExecute(widgetConfig, tenantId);
  } catch {
    // Malformed JSONB — fail closed
    return false;
  }
}