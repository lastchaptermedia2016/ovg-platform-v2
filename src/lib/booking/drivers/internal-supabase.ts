import { createClient } from '@/lib/supabase/server';
import type {
  AppointmentSlot,
  BookingReservation,
  IBookingProvider,
} from '@/interfaces/booking-provider.interface';
import { isValidUUID } from '@/lib/utils/uuid';

interface TenantLookupRow {
  id: string;
  tenant_id: string;
  is_active: boolean | null;
}

interface BookingSlotRow {
  id: string;
  start_time: string;
  end_time: string;
  status: 'AVAILABLE' | 'RESERVED' | 'CONFIRMED' | 'CANCELLED';
  reserved_count: number | null;
  capacity: number | null;
}

interface ReserveBookingSlotRpcResult {
  success: boolean;
  message: string;
  appointment_id: string;
  slot_id: string;
  start_time: string;
  end_time: string;
  status: 'RESERVED';
  reserved_at: string;
}

function parseBookingDate(dateStr: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    throw new Error('dateStr must use YYYY-MM-DD format');
  }

  const [year, month, day] = dateStr.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new Error('dateStr must represent a valid calendar date');
  }

  return parsed;
}

function mapSlot(row: BookingSlotRow): AppointmentSlot {
  return {
    id: row.id,
    startTime: new Date(row.start_time).toISOString(),
    endTime: new Date(row.end_time).toISOString(),
    status: row.status === 'CANCELLED' ? 'RESERVED' : row.status,
  };
}

export class InternalSupabaseBookingProvider implements IBookingProvider {
  private async resolveTenantId(tenantId: string): Promise<string> {
    const supabase = await createClient();
    const identifier = tenantId.trim();

    if (!identifier) {
      throw new Error('tenantId is required');
    }

    const query = isValidUUID(identifier)
      ? supabase
          .from('tenants')
          .select('id, tenant_id, is_active')
          .eq('id', identifier)
          .maybeSingle()
      : supabase
          .from('tenants')
          .select('id, tenant_id, is_active')
          .eq('tenant_id', identifier)
          .maybeSingle();

    const { data, error } = await query;
    const tenant = data as TenantLookupRow | null;

    if (error) {
      throw new Error(error.message);
    }

    if (!tenant) {
      throw new Error('Tenant not found');
    }

    if (tenant.is_active === false) {
      throw new Error('Tenant is inactive');
    }

    return tenant.id;
  }

  async getAvailableSlots(
    tenantId: string,
    dateStr: string,
  ): Promise<AppointmentSlot[]> {
    const resolvedTenantId = await this.resolveTenantId(tenantId);
    const dayStart = parseBookingDate(dateStr);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('booking_slots')
      .select('id, start_time, end_time, status, reserved_count, capacity')
      .eq('tenant_id', resolvedTenantId)
      .eq('status', 'AVAILABLE')
      .gte('start_time', dayStart.toISOString())
      .lt('start_time', dayEnd.toISOString())
      .order('start_time', { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    return (data as BookingSlotRow[] | null)
      ?.filter((slot) => (slot.reserved_count ?? 0) < (slot.capacity ?? 1))
      .map(mapSlot) ?? [];
  }

  async reserveSlot(
    tenantId: string,
    slotId: string,
    name: string,
    phone: string,
  ): Promise<BookingReservation> {
    const resolvedTenantId = await this.resolveTenantId(tenantId);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc('reserve_booking_slot', {
      p_tenant_id: resolvedTenantId,
      p_slot_id: slotId.trim(),
      p_client_name: name.trim(),
      p_client_phone: phone.trim(),
    });

    if (error) {
      throw new Error(error.message);
    }

    const result = (data as ReserveBookingSlotRpcResult[] | null)?.[0];

    if (!result) {
      throw new Error('No reservation result returned');
    }

    if (!result.success) {
      throw new Error(result.message || 'Reservation failed');
    }

    return {
      appointmentId: result.appointment_id,
      reservedAt: new Date(result.reserved_at).toISOString(),
      slot: mapSlot({
        id: result.slot_id,
        start_time: result.start_time,
        end_time: result.end_time,
        status: result.status,
        reserved_count: null,
        capacity: null,
      }),
    };
  }
}
