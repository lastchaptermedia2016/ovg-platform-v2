import type {
  BookingProviderType,
  IBookingProvider,
} from '@/interfaces/booking-provider.interface';
import { ExternalEnterpriseBookingProvider } from './drivers/external-enterprise';
import { InternalSupabaseBookingProvider } from './drivers/internal-supabase';

const providerFactories: Record<BookingProviderType, () => IBookingProvider> = {
  INTERNAL: () => new InternalSupabaseBookingProvider(),
  EXTERNAL: () => new ExternalEnterpriseBookingProvider(),
};

export function getProvider(providerType: string): IBookingProvider {
  const normalizedProviderType = providerType.toUpperCase() as BookingProviderType;
  const providerFactory = providerFactories[normalizedProviderType];

  if (!providerFactory) {
    throw new Error(`Unsupported booking provider: ${providerType}`);
  }

  return providerFactory();
}
