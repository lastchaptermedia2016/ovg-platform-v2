import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { z } from 'zod';
import { encryptSensitiveIntegrationFields, sanitizeIntegrationsForRead } from '@/lib/ai/integration-crypto';
import { ClientIntegrationConfigSchema } from '@/lib/schemas/client-config.schema';

export const dynamic = 'force-dynamic';

const INTEGRATIONS_KEY = 'integrations';

/**
 * @file manage-client-integrations/route.ts
 *
 * Reseller Managed-Service Delegation endpoint.
 *
 * Allows an authenticated reseller to read and configure the `widget_config
 * .integrations` blob of a tenant they own/manage. Every read and write is
 * gated by an explicit ownership check: the resolved tenant's `reseller_id`
 * must match a reseller row linked to the calling user via `user_resellers`.
 * This prevents any cross-tenant injection — a reseller can never touch a
 * client that does not belong to them.
 */

const SaveSchema = z.object({
  targetClientId: z.string().min(1, 'targetClientId is required'),
  integrationId: z.string().min(1, 'integrationId is required'),
  config: ClientIntegrationConfigSchema.optional().default({}),
});

// ──────────────────────────── Ownership verification ────────────────────────

/**
 * Resolve the tenant row for `targetClientId` and confirm the calling user is
 * authorized to manage it. The tenant may be referenced by its UUID PK or its
 * `tenant_id` slug; both paths require the same ownership check.
 *
 * Returns `{ tenantId, resellerId }` on success, or `null` when the tenant is
 * missing or not owned by the caller (treated identically → 404 to avoid
 * leaking existence of other resellers' clients).
 */
async function resolveOwnedTenant(
  userId: string,
  targetClientId: string,
): Promise<{ tenantId: string; resellerId: string } | null> {
  const supabase = await createClient();
  const trimmed = targetClientId.trim();
  if (!trimmed) return null;

  // 1. Resolve the tenant row (PK or slug) through the user session client so
  //    RLS constrains the result to the caller's visible tenants.
  const { data: tenant, error } = await supabase
    .from('tenants')
    .select('id, reseller_id')
    .eq('id', trimmed)
    .maybeSingle();

  if (error || !tenant) {
    // Fallback: the identifier may be the text `tenant_id` slug.
    const { data: bySlug } = await supabase
      .from('tenants')
      .select('id, reseller_id')
      .eq('tenant_id', trimmed)
      .maybeSingle();
    if (!bySlug) return null;
    return { tenantId: bySlug.id as string, resellerId: bySlug.reseller_id as string };
  }

  const resellerId = tenant.reseller_id as string | null;
  if (!resellerId) return null;

  // 2. Confirm the caller is linked to that reseller via user_resellers.
  const { data: link } = await supabase
    .from('user_resellers')
    .select('reseller_id')
    .eq('user_id', userId)
    .eq('reseller_id', resellerId)
    .maybeSingle();

  if (!link) return null;

  return { tenantId: tenant.id as string, resellerId };
}

// ──────────────────────────── Handlers ──────────────────────────────────────

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const targetClientId = request.nextUrl.searchParams.get('targetClientId');
  if (!targetClientId) {
    return NextResponse.json({ error: 'Missing targetClientId' }, { status: 400 });
  }

  const owned = await resolveOwnedTenant(user.id, targetClientId);
  if (!owned) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('tenants')
      .select('widget_config')
      .eq('id', owned.tenantId)
      .maybeSingle();
    if (error || !data?.widget_config) {
      return NextResponse.json({ integrations: {} });
    }

    const config = data.widget_config as Record<string, unknown>;
    const raw = config[INTEGRATIONS_KEY] as Record<string, unknown> | undefined;
    const integrations = raw ? sanitizeIntegrationsForRead(raw) : {};
    return NextResponse.json({ integrations });
  } catch (err) {
    console.error('[reseller/manage-client-integrations] GET failed:', err);
    return NextResponse.json({ integrations: {} }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = SaveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: 'Invalid request', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { targetClientId, integrationId, config } = parsed.data;

  const owned = await resolveOwnedTenant(user.id, targetClientId);
  if (!owned) {
    // Identical 404 for missing and non-owned clients (no existence leak).
    return NextResponse.json({ success: false, error: 'Client not found' }, { status: 404 });
  }

  try {
    // Load the tenant's current widget_config so we merge (and never clobber
    // other integrations or the branding/persona sections).
    const { data: current, error: readErr } = await supabaseAdmin
      .from('tenants')
      .select('widget_config')
      .eq('id', owned.tenantId)
      .eq('reseller_id', owned.resellerId)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);

    const currentConfig = (current?.widget_config as Record<string, unknown> | null) ?? {};
    const currentIntegrations =
      (currentConfig[INTEGRATIONS_KEY] as Record<string, unknown> | undefined) ?? {};

    // Encrypt sensitive fields (API keys / tokens) before persisting. Idempotent
    // against already-encrypted envelopes and masked "••••" values.
    const encryptedConfig = encryptSensitiveIntegrationFields(config as Record<string, unknown>);
    const mergedIntegration = deepMerge(
      (currentIntegrations[integrationId] as Record<string, unknown> | undefined) ?? {},
      encryptedConfig
    );

    const nextIntegrations = {
      ...currentIntegrations,
      [integrationId]: mergedIntegration,
    };

    const nextWidgetConfig = {
      ...currentConfig,
      [INTEGRATIONS_KEY]: nextIntegrations,
    };

    // Ownership-scoped write: the .eq('reseller_id', ...) guard means a stale or
    // tampered tenant id can never write to a row the caller doesn't own.
    const { error: updateErr } = await supabaseAdmin
      .from('tenants')
      .update({ widget_config: nextWidgetConfig, updated_at: new Date().toISOString() })
      .eq('id', owned.tenantId)
      .eq('reseller_id', owned.resellerId);

    if (updateErr) throw new Error(updateErr.message);

    return NextResponse.json({ success: true, updatedAt: new Date().toISOString() });
  } catch (err) {
    console.error('[reseller/manage-client-integrations] POST failed:', err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

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
