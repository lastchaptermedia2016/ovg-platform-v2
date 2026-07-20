import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { z } from 'zod';
import { isValidUUID } from '@/lib/utils/uuid';

interface TenantMetadataRecord {
  id: string;
  tenant_id: string;
  reseller_id: string | null;
  metadata: unknown;
}

const UpdateIntegrationSuiteSchema = z.object({
  tenantId: z.string().min(1, 'tenantId is required'),
  enabled: z.boolean(),
  providerType: z.enum(['INTERNAL', 'EXTERNAL']),
});

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const output: Record<string, unknown> = { ...target };

  for (const [key, value] of Object.entries(source)) {
    const targetValue = target[key];
    const targetRecord = asRecord(targetValue);
    const sourceRecord = asRecord(value);

    output[key] =
      targetRecord && sourceRecord ? deepMerge(targetRecord, sourceRecord) : value;
  }

  return output;
}

async function resolveTenant(identifier: string): Promise<TenantMetadataRecord | null> {
  const supabase = await createClient();
  const trimmed = identifier.trim();

  if (!trimmed) {
    return null;
  }

  let result = await supabase
    .from('tenants')
    .select('id, tenant_id, reseller_id, metadata')
    .eq('id', trimmed)
    .maybeSingle();

  if (!result.data && isValidUUID(trimmed)) {
    result = await supabase
      .from('tenants')
      .select('id, tenant_id, reseller_id, metadata')
      .eq('tenant_id', trimmed)
      .maybeSingle();
  }

  if (!result.data && !isValidUUID(trimmed)) {
    result = await supabase
      .from('tenants')
      .select('id, tenant_id, reseller_id, metadata')
      .eq('tenant_id', trimmed)
      .maybeSingle();
  }

  if (result.data) {
    return result.data as TenantMetadataRecord;
  }

  if (!result.error || result.error.code !== 'PGRST116') {
    return null;
  }

  const adminResult = await supabaseAdmin
    .from('tenants')
    .select('id, tenant_id, reseller_id, metadata')
    .eq('id', trimmed)
    .maybeSingle();

  if (adminResult.data) {
    return adminResult.data as TenantMetadataRecord;
  }

  if (!adminResult.data && isValidUUID(trimmed)) {
    const adminTenantResult = await supabaseAdmin
      .from('tenants')
      .select('id, tenant_id, reseller_id, metadata')
      .eq('tenant_id', trimmed)
      .maybeSingle();

    return (adminTenantResult.data as TenantMetadataRecord | null) ?? null;
  }

  if (!adminResult.data && !isValidUUID(trimmed)) {
    const adminTenantResult = await supabaseAdmin
      .from('tenants')
      .select('id, tenant_id, reseller_id, metadata')
      .eq('tenant_id', trimmed)
      .maybeSingle();

    return (adminTenantResult.data as TenantMetadataRecord | null) ?? null;
  }

  return null;
}

async function authorizeTenantAccess(
  userId: string,
  tenant: TenantMetadataRecord,
): Promise<boolean> {
  if (!tenant.reseller_id) {
    return false;
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from('user_resellers')
    .select('reseller_id')
    .eq('user_id', userId)
    .eq('reseller_id', tenant.reseller_id)
    .maybeSingle();

  if (data) {
    return true;
  }

  const { data: adminData } = await supabaseAdmin
    .from('user_resellers')
    .select('reseller_id')
    .eq('user_id', userId)
    .eq('reseller_id', tenant.reseller_id)
    .maybeSingle();

  return !!adminData;
}

function jsonError(error: Error, status: number) {
  return NextResponse.json(
    { success: false, error: error.message },
    { status },
  );
}

export async function POST(request: NextRequest) {
  console.warn('[Deprecated] /api/tenants/update-integration-suite is deprecated. Use /api/client/update-studio-config instead.');
  try {
    const body = await request.json();
    const parsed = UpdateIntegrationSuiteSchema.safeParse(body);

    if (!parsed.success) {
      return jsonError(new Error('Invalid request body'), 400);
    }

    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return jsonError(new Error('Unauthorized'), 401);
    }

    const { tenantId, enabled, providerType } = parsed.data;
    const tenant = await resolveTenant(tenantId);

    if (!tenant) {
      return jsonError(new Error('Tenant not found'), 404);
    }

    const isAuthorized = await authorizeTenantAccess(user.id, tenant);

    if (!isAuthorized) {
      return jsonError(new Error('Forbidden'), 403);
    }

    const currentMetadata = asRecord(tenant.metadata) ?? {};
    const bookingConfig = readNestedRecord(currentMetadata, ['integrations', 'booking']) ?? {};
    const bookingMetadata = asRecord(currentMetadata.booking) ?? {};
    const updatedAt = new Date().toISOString();
    const nextMetadata = deepMerge(currentMetadata, {
      integrations: {
        booking: {
          ...bookingConfig,
          enabled,
          providerType,
          updatedAt,
        },
      },
      booking: {
        ...bookingMetadata,
        enabledAddons: enabled,
        providerType,
        updatedAt,
      },
      booking_provider_type: providerType,
      enabled_addons: enabled,
    });

    const { error: updateError } = await supabase
      .from('tenants')
      .update({
        metadata: nextMetadata,
        updated_at: updatedAt,
      })
      .eq('id', tenant.id)
      .eq('reseller_id', tenant.reseller_id);

    if (updateError) {
      const { error: adminError } = await supabaseAdmin
        .from('tenants')
        .update({
          metadata: nextMetadata,
          updated_at: updatedAt,
        })
        .eq('id', tenant.id)
        .eq('reseller_id', tenant.reseller_id);

      if (adminError) {
        return jsonError(new Error('Failed to update tenant metadata'), 500);
      }
    }

    return NextResponse.json(
      {
        success: true,
        tenantId: tenant.id,
        metadata: nextMetadata,
        deprecated: true,
        message: 'Use /api/client/update-studio-config',
      },
      {
        headers: {
          Deprecation: 'true',
        },
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (message === 'Unauthorized') return jsonError(new Error(message), 401);
    if (message === 'Forbidden') return jsonError(new Error(message), 403);

    return jsonError(new Error(message), 500);
  }
}

function readNestedRecord(
  source: Record<string, unknown>,
  path: readonly string[],
): Record<string, unknown> | null {
  let current: unknown = source;

  for (const segment of path) {
    const record = asRecord(current);
    if (!record) return null;
    current = record[segment];
  }

  return asRecord(current);
}
