import { createAuthClient } from '@/lib/auth/server';
import { ClientWidgetStudioSchema, ClientWidgetStudio } from '@/lib/schemas/client-config.schema';
import { ZodError, ZodIssue } from 'zod';

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

  // Log to action_logs
  try {
    const supabase = await createAuthClient();
    await supabase.from('action_logs').insert({
      action_id: actionId,
      tenant_id: ctx.tenantId,
      user_id: ctx.userId,
      source: ctx.source,
      params: rawParams as Record<string, unknown>,
      result: null,
    });
  } catch (err) {
    console.error('[ActionRegistry] Failed to log action:', err);
  }

  // Execute
  return def.execute(params, ctx) as Promise<TResult>;
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

export async function dispatchUpdateStudioConfig(
  params: ClientWidgetStudio,
  ctx: ActionContext
): Promise<ActionResult> {
  const supabase = await createAuthClient();

  // Fetch current widget_config to merge partial updates
  const { data: currentTenant, error: fetchError } = await supabase
    .from('tenants')
    .select('widget_config')
    .eq('id', ctx.tenantId)
    .single();

  if (fetchError) {
    throw new Error(fetchError.message);
  }

  const currentConfig = (currentTenant?.widget_config as Record<string, unknown> | null) ?? {};

  // widget_config.widget_studio is RETIRED as a write target. Each incoming
  // studio section is deep-merged into its canonical top-level key so that the
  // client portal and reseller portal share one source of truth.
  const nextConfig: Record<string, unknown> = { ...currentConfig };

  if (params.branding !== undefined) {
    const currentBranding = (currentConfig.branding as Record<string, unknown> | undefined) ?? {};
    nextConfig.branding = deepMerge(currentBranding, params.branding as Record<string, unknown>);
  }

  if (params.aiPersona !== undefined) {
    const currentPersona = (currentConfig.aiPersona as Record<string, unknown> | undefined) ?? {};
    nextConfig.aiPersona = deepMerge(currentPersona, params.aiPersona as Record<string, unknown>);
  }

  // Deprecation monitoring: warn if any legacy widget_studio-specific keys
  // are still being submitted so the cleanup can be tracked.
  const legacyKeys = Object.keys(params).filter((key) => key === 'widget_studio');
  if (legacyKeys.length > 0) {
    console.warn('[dispatchUpdateStudioConfig] LEGACY widget_studio payload ignored:', legacyKeys);
  }

  const { error } = await supabase
    .from('tenants')
    .update({
      widget_config: nextConfig,
      updated_at: new Date().toISOString(),
    })
    .eq('id', ctx.tenantId)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return { success: true };
}

/**
 * Deep merge two objects, preserving nested values.
 * Only overwrites leaf properties that are explicitly provided.
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
      !Array.isArray(targetValue)
    ) {
      result[key] = deepMerge(targetValue as Record<string, unknown>, sourceValue as Record<string, unknown>);
    } else if (sourceValue !== undefined) {
      result[key] = sourceValue;
    }
  }
  return result;
}
