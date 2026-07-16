import { createAuthClient } from '@/lib/auth/server';
import { resolveTenantId } from '@/lib/resolveTenantId';
import { dispatchUpdateStudioConfig } from '@/lib/actionRegistry';
import {
  ClientIntegrationsSchema,
  type ClientIntegrations,
  type ClientIntegrationConfig,
} from '@/lib/schemas/client-config.schema';
import { encryptSensitiveIntegrationFields, sanitizeIntegrationsForRead } from '@/lib/ai/integration-crypto';

const INTEGRATIONS_KEY = 'integrations';

export interface IntegrationsReadResult {
  integrations: ClientIntegrations;
}

export interface IntegrationsWriteResult {
  success: boolean;
}

/**
 * Load the tenant's saved integrations from `widget_config.integrations`.
 *
 * Sensitive fields (CRM API key, Twilio token) are stored encrypted, so they
 * are never returned to the client. Instead we surface an `isConfigured`
 * boolean so the UI can reflect a configured / unconfigured state.
 */
export async function getIntegrationsForUser(
  userId: string,
  supabase = createAuthClient()
): Promise<IntegrationsReadResult> {
  const client = await (supabase instanceof Promise ? supabase : Promise.resolve(supabase));
  const { data: tenantId, error: tenantErr } = await resolveTenantId(userId, client);
  if (tenantErr || !tenantId) {
    return { integrations: {} };
  }

  const { data, error } = await client
    .from('tenants')
    .select('widget_config')
    .eq('id', tenantId)
    .maybeSingle();

  if (error || !data?.widget_config) {
    return { integrations: {} };
  }

  const config = data.widget_config as Record<string, unknown>;
  const raw = config[INTEGRATIONS_KEY] as Record<string, unknown> | undefined;
  if (!raw) return { integrations: {} };

  const parsed = ClientIntegrationsSchema.safeParse(raw);
  if (!parsed.success) return { integrations: {} };

  return { integrations: sanitizeIntegrationsForRead(parsed.data) };
}

/**
 * Persist a partial integrations map for a single integration id. Existing
 * integration configs are merged (deep) so a save for one add-on never
 * clobbers the others. Sensitive fields are encrypted before write.
 */
export async function saveIntegrationForUser(
  userId: string,
  integrationId: string,
  config: ClientIntegrationConfig
): Promise<IntegrationsWriteResult> {
  const client = await createAuthClient();
  const { data: tenantId, error: tenantErr } = await resolveTenantId(userId, client);
  if (tenantErr || !tenantId) {
    throw new Error(tenantErr?.message ?? 'No tenant association found');
  }

  // Load current config to merge against (so we don't lose other integrations).
  const { data: current, error: readErr } = await client
    .from('tenants')
    .select('widget_config')
    .eq('id', tenantId)
    .maybeSingle();

  if (readErr) throw new Error(readErr.message);

  const currentConfig = (current?.widget_config as Record<string, unknown> | null) ?? {};
  const currentIntegrations = (currentConfig[INTEGRATIONS_KEY] as Record<string, unknown> | undefined) ?? {};

  const encryptedConfig = encryptSensitiveIntegrationFields(config as Record<string, unknown>);
  const mergedIntegration = deepMerge(
    (currentIntegrations[integrationId] as Record<string, unknown> | undefined) ?? {},
    encryptedConfig
  );

  const nextIntegrations = {
    ...currentIntegrations,
    [integrationId]: mergedIntegration,
  };

  await dispatchUpdateStudioConfig({ integrations: nextIntegrations } as never, {
    userId,
    tenantId,
    source: 'manual',
  }, client);

  return { success: true };
}

// ────────────────────────────────────────────────────────────────────
// Shared deep-merge (used for both client and reseller write paths)
// ────────────────────────────────────────────────────────────────────
function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>
): Record<string, unknown> {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    const sv = source[key];
    const tv = result[key];
    if (
      sv !== undefined &&
      sv !== null &&
      typeof sv === 'object' &&
      !Array.isArray(sv) &&
      tv !== undefined &&
      tv !== null &&
      typeof tv === 'object' &&
      !Array.isArray(tv)
    ) {
      result[key] = deepMerge(tv as Record<string, unknown>, sv as Record<string, unknown>);
    } else if (sv !== undefined) {
      result[key] = sv;
    }
  }
  return result;
}
