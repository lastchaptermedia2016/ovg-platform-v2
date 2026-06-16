import type {
  AppointmentSlot,
  BookingReservation,
  IBookingProvider,
} from '@/interfaces/booking-provider.interface';

export class ExternalEnterpriseBookingProvider implements IBookingProvider {
  async getAvailableSlots(
    _tenantId: string,
    _dateStr: string,
  ): Promise<AppointmentSlot[]> {
    throw new Error('External enterprise booking adapter is not configured');
  }

  async reserveSlot(
    _tenantId: string,
    _slotId: string,
    _name: string,
    _phone: string,
  ): Promise<BookingReservation> {
    throw new Error('External enterprise booking adapter is not configured');
  }
}
