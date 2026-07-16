import { createAuthClient } from '@/lib/auth/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { ClientWidgetStudioSchema, ClientWidgetStudio } from '@/lib/schemas/client-config.schema';
import { ZodError, ZodIssue } from 'zod';

type AuthSupabaseClient = Awaited<ReturnType<typeof createAuthClient>>;

// ────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────

export interface ActionContext {
  userId: string;
  tenantId: string;
  source: 'manual' | 'hannah';
}

export interface ActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface ActionDefinition<TParams = unknown, TResult = unknown> {
  id: string;
  description: string;
  category: string;
  paramsSchema: import('zod').ZodSchema<TParams>;
  requiresConfirmation?: boolean;
  execute: (params: TParams, ctx: ActionContext) => Promise<TResult>;
}

// ────────────────────────────────────────────────────────────────────
// Registry Store
// ────────────────────────────────────────────────────────────────────

const actionRegistry = new Map<string, ActionDefinition<unknown, unknown>>();

// ────────────────────────────────────────────────────────────────────
// Registration
// ────────────────────────────────────────────────────────────────────

export function registerAction<TParams = unknown, TResult = unknown>(
  def: ActionDefinition<TParams, TResult>
): void {
  if (actionRegistry.has(def.id)) {
    throw new Error(`Action "${def.id}" is already registered`);
  }
  actionRegistry.set(def.id, def as ActionDefinition<unknown, unknown>);
}

// ────────────────────────────────────────────────────────────────────
// Dispatch
// ────────────────────────────────────────────────────────────────────

export async function dispatchAction<TParams = unknown, TResult = unknown>(
  actionId: string,
  rawParams: unknown,
  ctx: ActionContext
): Promise<TResult> {
  const def = actionRegistry.get(actionId);
  if (!def) {
    throw new Error(`Unknown action: "${actionId}"`);
  }

  // Validate params against schema using parse()
  let params: TParams;
  try {
    params = (def.paramsSchema as import('zod').ZodSchema<TParams>).parse(rawParams);
  } catch (e) {
    const zodError = e instanceof ZodError ? e : new Error(String(e));
    const errorMessages = zodError instanceof ZodError
      ? zodError.errors.map((err: ZodIssue) => `${err.path.join('.')}: ${err.message}`).join('; ')
      : zodError.message;
    throw new Error(`Invalid params for action "${actionId}": ${errorMessages}`);
  }

  // Log to action_logs and capture the created row id so we can backfill
  // the outcome (success / duration / result) after execution.
  let logId: string | null = null;
  try {
    const supabase = await createAuthClient();
    const { data, error } = await supabase
      .from('action_logs')
      .insert({
        action_id: actionId,
        tenant_id: ctx.tenantId,
        user_id: ctx.userId,
        source: ctx.source,
        params: rawParams as Record<string, unknown>,
        result: null,
      })
      .select('id')
      .single();

    if (error) {
      console.error('[ActionRegistry] Failed to log action:', error);
    } else {
      logId = data?.id ?? null;
    }
  } catch (err) {
    console.error('[ActionRegistry] Failed to log action:', err);
  }

  // Execute with telemetry capture. The update is awaited so logs stay
  // accurate; the UI thread is already behind an async dispatch boundary.
  const start = performance.now();
  let success = true;
  let outcome: unknown;
  try {
    outcome = await def.execute(params, ctx);
  } catch (execErr) {
    success = false;
    outcome = {
      success: false,
      error: execErr instanceof Error ? execErr.message : String(execErr),
    };
  }
  const durationMs = Number((performance.now() - start).toFixed(2));

  if (logId) {
    try {
      const supabase = await createAuthClient();
      const { error: updateError } = await supabase
        .from('action_logs')
        .update({
          success,
          duration_ms: durationMs,
          result: outcome as Record<string, unknown>,
        })
        .eq('id', logId);

      if (updateError) {
        console.error('[ActionRegistry] Failed to update action log:', updateError);
      }
    } catch (err) {
      console.error('[ActionRegistry] Failed to update action log:', err);
    }
  }

  // Re-throw on failure so callers observe the original error semantics.
  if (!success) {
    const errResult = outcome as { error?: string };
    throw new Error(errResult?.error ?? `Action "${actionId}" failed`);
  }

  return outcome as TResult;
}

// ────────────────────────────────────────────────────────────────────
// Registered Actions
// ────────────────────────────────────────────────────────────────────

registerAction<ClientWidgetStudio, ActionResult>({
  id: 'updateStudioConfig',
  description: 'Update client widget studio configuration (branding + AI persona)',
  category: 'client-config',
  paramsSchema: ClientWidgetStudioSchema,
  requiresConfirmation: false,
  execute: async (params, ctx) => {
    return dispatchUpdateStudioConfig(params, ctx);
  },
});

// ────────────────────────────────────────────────────────────────────
// Route-specific helper
// ────────────────────────────────────────────────────────────────────

function normalizeBrandingPayload(
  branding: Record<string, unknown>
): Record<string, unknown> {
  const result = { ...branding };

  const header = result.header as Record<string, unknown> | undefined;
  if (header?.type === 'none') {
    result.headerConfig = { type: 'none' };
  }

  const footer = result.footer as Record<string, unknown> | undefined;
  if (footer?.type === 'none') {
    result.footerConfig = { type: 'none' };
  }

  const widgetBody = result.widgetBody as Record<string, unknown> | undefined;
  if (widgetBody?.type === 'none') {
    result.widgetBodyOpacity = null;
    result.widgetBodyBackground = null;
  }

  return result;
}

export async function dispatchUpdateStudioConfig(
  params: ClientWidgetStudio,
  ctx: ActionContext,
  supabase?: AuthSupabaseClient | Promise<AuthSupabaseClient>
): Promise<ActionResult> {
  const raw = supabase ?? createAuthClient();
  const client = raw instanceof Promise ? await raw : raw;

  // Dual-path resolution: accept either the PK `id` or the `tenant_id`
  // column value. This eliminates PostgREST single-row coercion errors
  // when callers pass a UUID that belongs to the `tenant_id` column.
  let currentTenant: { id: string; widget_config: unknown } | null = null;
  let resolutionError: string | null = null;

  try {
    const { data, error } = await client
      .from('tenants')
      .select('id, widget_config')
      .eq('id', ctx.tenantId)
      .maybeSingle();

    if (error) {
      resolutionError = error.message;
    } else {
      currentTenant = data;
    }
  } catch (err) {
    resolutionError = err instanceof Error ? err.message : String(err);
  }

  if (!currentTenant) {
    try {
      const { data, error } = await client
        .from('tenants')
        .select('id, widget_config')
        .eq('tenant_id', ctx.tenantId)
        .maybeSingle();

      if (error) {
        resolutionError = error.message;
      } else {
        currentTenant = data;
      }
    } catch (err) {
      resolutionError = err instanceof Error ? err.message : String(err);
    }
  }

  if (!currentTenant) {
    throw new Error(
      `Tenant not found for identifier "${ctx.tenantId}"${resolutionError ? `: ${resolutionError}` : ''}`
    );
  }

  const tenantId = currentTenant.id;
  const currentConfig = (currentTenant?.widget_config as Record<string, unknown> | null) ?? {};

  // widget_config.widget_studio is RETIRED as a write target. Each incoming
  // studio section is deep-merged into its canonical top-level key so that the
  // client portal and reseller portal share one source of truth.
  const nextConfig: Record<string, unknown> = { ...currentConfig };

  if (params.branding !== undefined) {
    const currentBranding = (currentConfig.branding as Record<string, unknown> | undefined) ?? {};
    const normalized = normalizeBrandingPayload(params.branding as Record<string, unknown>);
    nextConfig.branding = deepMerge(currentBranding, normalized);
  }

  if (params.aiPersona !== undefined) {
    const currentPersona = (currentConfig.aiPersona as Record<string, unknown> | undefined) ?? {};
    nextConfig.aiPersona = deepMerge(currentPersona, params.aiPersona as Record<string, unknown>);
  }

  // Project the `features` block (AI add-ons, Design Mirror, Custom CSS) so the
  // client loop persists them instead of silently dropping them on the
  // passthrough. Mirrors the canonical pipeline's handling of widget_config.features.
  if (params.features !== undefined) {
    const currentFeatures = (currentConfig.features as Record<string, unknown> | undefined) ?? {};
    nextConfig.features = deepMerge(currentFeatures, params.features as Record<string, unknown>);
  }

  // Merged by the integrations service, which has already deep-merged the new
  // integration config into the full integrations map. Persist it as-is under
  // the canonical `integrations` key so it shares the widget_config source of
  // truth with branding and persona.
  if (params.integrations !== undefined) {
    nextConfig.integrations = params.integrations as Record<string, unknown>;
  }

  // Deprecation monitoring: warn if any legacy widget_studio-specific keys
  // are still being submitted so the cleanup can be tracked.
  const legacyKeys = Object.keys(params).filter((key) => key === 'widget_studio');
  if (legacyKeys.length > 0) {
    console.warn('[dispatchUpdateStudioConfig] LEGACY widget_studio payload ignored:', legacyKeys);
  }

  const { error } = await client
    .from('tenants')
    .update({
      widget_config: nextConfig,
      updated_at: new Date().toISOString(),
    })
    .eq('id', tenantId)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  // Propagate branding changes to the linked reseller so live widgets
  // reading resellers.branding_colors / branding_assets stay in sync
  // with the tenant widget_config.
  const { data: tenantRecord } = await client
    .from('tenants')
    .select('reseller_id')
    .eq('id', tenantId)
    .single();

  if (tenantRecord?.reseller_id) {
    const propagatedPayload = { ...(nextConfig.branding as Record<string, unknown>) };
    const brandingColor = (propagatedPayload.primaryColor as string | undefined) ?? '#0097b2';
    const accentColor = (propagatedPayload.accentColor as string | undefined) ?? '#D4AF37';
    const logoUrl = (propagatedPayload.logoUrl as string | undefined) ?? null;

    const { data: _rpcResult, error: rpcError } = await supabaseAdmin.rpc(
      'sync_reseller_branding',
      {
        p_tenant_id: tenantRecord.reseller_id,
        p_branding_bag: {
          primaryColor: brandingColor,
          accentColor: accentColor,
          logoUrl: logoUrl,
          favicon: null,
          metaTitle: null,
          metaDescription: null,
          typography: { headingFont: 'Inter', bodyFont: 'Inter' },
          borderRadius: 8,
          mode: 'light',
        },
        p_expected_version: 1,
      }
    );

    if (rpcError) {
      console.error('[dispatchUpdateStudioConfig] Reseller propagation failed:', rpcError);
    }
  }

  return { success: true };
}

/**
 * Deep merge two objects, preserving nested values.
 * Only overwrites leaf properties that are explicitly provided.
 * If the source declares an explicit structural intent (presence of a 'type'
 * key), overwrite the entire target object instead of recursively merging
 * nested keys so stale parameters are eliminated cleanly.
 */
function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>
): Record<string, unknown> {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    const sourceValue = source[key];
    const targetValue = result[key];
    if (
      sourceValue !== undefined &&
      sourceValue !== null &&
      typeof sourceValue === 'object' &&
      !Array.isArray(sourceValue) &&
      targetValue !== undefined &&
      typeof targetValue === 'object' &&
      !Array.isArray(targetValue) &&
      !('type' in (sourceValue as Record<string, unknown>))
    ) {
      result[key] = deepMerge(targetValue as Record<string, unknown>, sourceValue as Record<string, unknown>);
    } else if (sourceValue !== undefined) {
      result[key] = sourceValue;
    }
  }
  return result;
}
