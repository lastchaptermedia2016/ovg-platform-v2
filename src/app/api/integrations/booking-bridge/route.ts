import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { z } from 'zod';
import { getProvider } from '@/lib/booking/booking-factory';
import type {
  AppointmentSlot,
  BookingProviderType,
  IBookingProvider,
} from '@/interfaces/booking-provider.interface';
import { isValidUUID } from '@/lib/utils/uuid';

interface TenantBookingRecord {
  id: string;
  tenant_id: string;
  reseller_id: string | null;
  is_active: boolean | null;
  metadata: unknown;
  widget_config?: unknown;
}

interface BookingIntegrationConfig {
  enabled: boolean;
  providerType: BookingProviderType;
}

interface AuthorizedTenantContext {
  tenant: TenantBookingRecord;
  providerType: BookingProviderType;
}

const BookingProviderTypes = ['INTERNAL', 'EXTERNAL'] as const;

const BookingBridgeGetSchema = z.object({
  tenantId: z.string().min(1, 'tenantId is required'),
  dateStr: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'dateStr must use YYYY-MM-DD format')
    .optional(),
});

const BookingBridgePostSchema = z.object({
  tenantId: z.string().min(1, 'tenantId is required'),
  slotId: z.string().uuid('slotId must be a valid UUID').optional(),
  targetTimestamp: z.string().datetime().optional(),
  clientName: z.string().trim().min(1, 'clientName is required'),
  clientPhone: z.string().trim().min(1, 'clientPhone is required'),
});

const ReservationResponseSchema = z.object({
  success: z.literal(true),
  tenantId: z.string(),
  slotId: z.string(),
  appointmentId: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  status: z.literal('RESERVED'),
  reservedAt: z.string(),
  providerType: z.enum(BookingProviderTypes),
});

function normalizeProviderType(value: unknown): BookingProviderType {
  return value === 'EXTERNAL' ? 'EXTERNAL' : 'INTERNAL';
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readNestedRecord(
  source: unknown,
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

function readBoolean(value: unknown): boolean {
  return value === true || value === 'true';
}

function readBookingIntegrationConfig(
  tenant: TenantBookingRecord,
): BookingIntegrationConfig {
  const metadataConfig = readNestedRecord(tenant.metadata, [
    'integrations',
    'booking',
  ]);
  const widgetConfig = readNestedRecord(tenant.widget_config, [
    'integrations',
    'booking',
  ]);
  const providerType = normalizeProviderType(
    widgetConfig?.providerType ?? metadataConfig?.providerType ?? 'INTERNAL',
  );
  const enabled = readBoolean(
    widgetConfig?.enabled ?? metadataConfig?.enabled ?? false,
  );

  return { enabled, providerType };
}

function getUtcTodayDateStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function toDateStr(date: Date): string {
  return date.toISOString().slice(0, 10);
}

async function resolveTenant(identifier: string): Promise<TenantBookingRecord | null> {
  const supabase = await createClient();
  const trimmed = identifier.trim();

  if (!trimmed) {
    return null;
  }

  let result = await supabase
    .from('tenants')
    .select('id, tenant_id, reseller_id, is_active, metadata, widget_config')
    .eq('id', trimmed)
    .maybeSingle();

  if (!result.data && isValidUUID(trimmed)) {
    result = await supabase
      .from('tenants')
      .select('id, tenant_id, reseller_id, is_active, metadata, widget_config')
      .eq('tenant_id', trimmed)
      .maybeSingle();
  }

  if (!result.data && !isValidUUID(trimmed)) {
    result = await supabase
      .from('tenants')
      .select('id, tenant_id, reseller_id, is_active, metadata, widget_config')
      .eq('tenant_id', trimmed)
      .maybeSingle();
  }

  if (result.data) {
    return result.data as TenantBookingRecord;
  }

  if (!result.error || result.error.code !== 'PGRST116') {
    return null;
  }

  const adminResult = await supabaseAdmin
    .from('tenants')
    .select('id, tenant_id, reseller_id, is_active, metadata, widget_config')
    .eq('id', trimmed)
    .maybeSingle();

  if (adminResult.data) {
    return adminResult.data as TenantBookingRecord;
  }

  if (!adminResult.data && isValidUUID(trimmed)) {
    const adminTenantResult = await supabaseAdmin
      .from('tenants')
      .select('id, tenant_id, reseller_id, is_active, metadata, widget_config')
      .eq('tenant_id', trimmed)
      .maybeSingle();

    return (adminTenantResult.data as TenantBookingRecord | null) ?? null;
  }

  if (!adminResult.data && !isValidUUID(trimmed)) {
    const adminTenantResult = await supabaseAdmin
      .from('tenants')
      .select('id, tenant_id, reseller_id, is_active, metadata, widget_config')
      .eq('tenant_id', trimmed)
      .maybeSingle();

    return (adminTenantResult.data as TenantBookingRecord | null) ?? null;
  }

  return null;
}

async function authorizeTenantAccess(
  userId: string,
  tenant: TenantBookingRecord,
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

async function authenticateAndResolveTenant(
  tenantIdentifier: string,
): Promise<AuthorizedTenantContext> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error('Unauthorized');
  }

  const tenant = await resolveTenant(tenantIdentifier);

  if (!tenant) {
    throw new Error('Tenant not found');
  }

  if (tenant.is_active === false) {
    throw new Error('Tenant is inactive');
  }

  const isAuthorized = await authorizeTenantAccess(user.id, tenant);

  if (!isAuthorized) {
    throw new Error('Forbidden');
  }

  const bookingConfig = readBookingIntegrationConfig(tenant);

  if (!bookingConfig.enabled) {
    throw new Error('Booking bridge is disabled for this tenant');
  }

  return {
    tenant,
    providerType: bookingConfig.providerType,
  };
}

async function resolveSlotIdFromTimestamp(
  provider: IBookingProvider,
  tenantId: string,
  targetTimestamp: string,
): Promise<string> {
  const targetDate = new Date(targetTimestamp);

  if (Number.isNaN(targetDate.getTime())) {
    throw new Error('targetTimestamp must be a valid ISO datetime');
  }

  const slots = await provider.getAvailableSlots(tenantId, toDateStr(targetDate));
  const targetIso = targetDate.toISOString();
  const matchedSlot = slots.find(
    (slot: AppointmentSlot) => new Date(slot.startTime).toISOString() === targetIso,
  );

  if (!matchedSlot) {
    throw new Error('No available slot matches targetTimestamp');
  }

  return matchedSlot.id;
}

function jsonError(error: Error, status: number) {
  return NextResponse.json(
    { success: false, error: error.message },
    { status },
  );
}

export async function GET(request: NextRequest) {
  try {
    const parsed = BookingBridgeGetSchema.safeParse(
      Object.fromEntries(request.url ? new URL(request.url).searchParams : []),
    );

    if (!parsed.success) {
      return jsonError(new Error('Invalid query parameters'), 400);
    }

    const { tenantId, dateStr = getUtcTodayDateStr() } = parsed.data;
    const context = await authenticateAndResolveTenant(tenantId);
    const provider = getProvider(context.providerType);
    const slots = await provider.getAvailableSlots(context.tenant.id, dateStr);

    return NextResponse.json({
      success: true,
      tenantId: context.tenant.id,
      providerType: context.providerType,
      dateStr,
      slots,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (message === 'Unauthorized') return jsonError(new Error(message), 401);
    if (message === 'Forbidden') return jsonError(new Error(message), 403);
    if (message === 'Tenant not found' || message === 'Tenant is inactive') {
      return jsonError(new Error(message), 404);
    }
    if (message === 'Booking bridge is disabled for this tenant') {
      return jsonError(new Error(message), 403);
    }
    if (message.includes('External enterprise booking adapter')) {
      return jsonError(new Error('External booking adapter is not configured'), 501);
    }

    return jsonError(new Error(message), 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = BookingBridgePostSchema.safeParse(body);

    if (!parsed.success) {
      return jsonError(new Error('Invalid request body'), 400);
    }

    const { tenantId, slotId, targetTimestamp, clientName, clientPhone } =
      parsed.data;
    const context = await authenticateAndResolveTenant(tenantId);
    const provider = getProvider(context.providerType);
    const resolvedSlotId = slotId
      ?? (await resolveSlotIdFromTimestamp(provider, context.tenant.id, targetTimestamp ?? new Date().toISOString()));

    if (!resolvedSlotId) {
      return jsonError(new Error('slotId or targetTimestamp is required'), 400);
    }

    const reservation = await provider.reserveSlot(
      context.tenant.id,
      resolvedSlotId,
      clientName,
      clientPhone,
    );

    const response = ReservationResponseSchema.parse({
      success: true,
      tenantId: context.tenant.id,
      slotId: reservation.slot.id,
      appointmentId: reservation.appointmentId,
      startTime: reservation.slot.startTime,
      endTime: reservation.slot.endTime,
      status: 'RESERVED',
      reservedAt: reservation.reservedAt,
      providerType: context.providerType,
    });

    return NextResponse.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (message === 'Unauthorized') return jsonError(new Error(message), 401);
    if (message === 'Forbidden') return jsonError(new Error(message), 403);
    if (message === 'Tenant not found' || message === 'Tenant is inactive') {
      return jsonError(new Error(message), 404);
    }
    if (message === 'Booking bridge is disabled for this tenant') {
      return jsonError(new Error(message), 403);
    }
    if (message.includes('External enterprise booking adapter')) {
      return jsonError(new Error('External booking adapter is not configured'), 501);
    }
    if (message.includes('No available slot matches targetTimestamp')) {
      return jsonError(new Error(message), 404);
    }

    return jsonError(new Error(message), 500);
  }
}
