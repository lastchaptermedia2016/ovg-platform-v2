export type BookingProviderType = 'INTERNAL' | 'EXTERNAL';

export type BookingSlotStatus = 'AVAILABLE' | 'RESERVED' | 'CONFIRMED';

export interface AppointmentSlot {
  id: string;
  startTime: string;
  endTime: string;
  status: BookingSlotStatus;
}

export interface BookingReservation {
  appointmentId: string;
  slot: AppointmentSlot;
  reservedAt: string;
}

export interface IBookingProvider {
  getAvailableSlots(tenantId: string, dateStr: string): Promise<AppointmentSlot[]>;
  reserveSlot(
    tenantId: string,
    slotId: string,
    name: string,
    phone: string,
  ): Promise<BookingReservation>;
}
