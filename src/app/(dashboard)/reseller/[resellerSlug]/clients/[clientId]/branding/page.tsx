'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { useParams, useRouter } from 'next/navigation';
import { isInvalidSlug } from '@/lib/utils/guard';
import { ClientBrandingStudio } from '@/components/reseller/ClientBrandingStudio';
import { IntegrationSuite } from '@/components/reseller/IntegrationSuite';
import type { BookingProviderType } from '@/interfaces/booking-provider.interface';
import type { Client, Tenant } from '@/types';
import type { SuggestedAction } from '@/lib/schemas/tenant-config.canonical';

interface BookingIntegrationState {
  enabled: boolean;
  providerType: BookingProviderType;
}

function readBookingIntegrationState(tenant: Tenant | null): BookingIntegrationState {
  const metadata = (tenant as Tenant & { metadata?: unknown } | null)?.metadata;
  const widgetConfig = (tenant as Tenant & { widget_config?: unknown } | null)?.widget_config;

  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    const integrations = (metadata as Record<string, unknown>).integrations;
    if (integrations && typeof integrations === 'object' && !Array.isArray(integrations)) {
      const booking = (integrations as Record<string, unknown>).booking;
      if (booking && typeof booking === 'object' && !Array.isArray(booking)) {
        const bookingRecord = booking as Record<string, unknown>;
        return {
          enabled: bookingRecord.enabled === true,
          providerType: bookingRecord.providerType === 'EXTERNAL' ? 'EXTERNAL' : 'INTERNAL',
        };
      }
    }
  }

  if (widgetConfig && typeof widgetConfig === 'object' && !Array.isArray(widgetConfig)) {
    const integrations = (widgetConfig as Record<string, unknown>).integrations;
    if (integrations && typeof integrations === 'object' && !Array.isArray(integrations)) {
      const booking = (integrations as Record<string, unknown>).booking;
      if (booking && typeof booking === 'object' && !Array.isArray(booking)) {
        const bookingRecord = booking as Record<string, unknown>;
        return {
          enabled: bookingRecord.enabled === true,
          providerType: bookingRecord.providerType === 'EXTERNAL' ? 'EXTERNAL' : 'INTERNAL',
        };
      }
    }
  }

  return {
    enabled: false,
    providerType: 'INTERNAL',
  };
}

export default function ClientBrandingPage() {
  const params = useParams();
  const router = useRouter();
  // CRITICAL: Use String() runtime coercion, not TypeScript's compile-time `as string`.
  // useParams() can return a Proxy object during SSR/hydration that hasn't resolved
  // to a primitive string yet. String() ensures a primitve is always passed downstream.
  const resellerSlug = String(params.resellerSlug ?? '');
  const clientId = String(params.clientId ?? '');

  // 🔷 Production Excellence: Detect Next.js hydration issues with route params
  if (isInvalidSlug(resellerSlug) || isInvalidSlug(clientId)) {
    console.error('%c[Pierre] ❌ Route parameter failed to resolve (client branding):', 'color: #0097b2; font-weight: bold;', { resellerSlug, clientId, params });
  }

  const [isLoading, setIsLoading] = useState(true);
  const [clientData, setClientData] = useState<Tenant | null>(null);
  const [allClients, setAllClients] = useState<Client[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [integrationState, setIntegrationState] = useState<BookingIntegrationState>({
    enabled: false,
    providerType: 'INTERNAL',
  });

  useEffect(() => {
    async function fetchData() {
      try {
        // Fetch current client data
        const clientResponse = await fetch(`/api/tenants/${clientId}`);
        if (!clientResponse.ok) throw new Error('Failed to fetch client data');
        const clientDataResult = await clientResponse.json() as Tenant;
        setClientData(clientDataResult);
        setIntegrationState(readBookingIntegrationState(clientDataResult));

        // Fetch all reseller clients
        const clientsResponse = await fetch(`/api/reseller/${resellerSlug}/clients`);
        if (!clientsResponse.ok) throw new Error('Failed to fetch clients');
        const clientsDataResult = await clientsResponse.json() as Client[];
        setAllClients(clientsDataResult);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setIsLoading(false);
      }
    }

    if (clientId && !isInvalidSlug(clientId) && !isInvalidSlug(resellerSlug)) {
      fetchData();
    }
  }, [clientId, resellerSlug]);

  const handleClientChange = useCallback((newClientId: string) => {
    router.push(`/reseller/${resellerSlug}/clients/${newClientId}/branding`);
  }, [resellerSlug, router]);

  // Extract features and branding from the tenant's widget_config for toggle hydration.
  // This ensures that both functional flags and design tokens are cleanly bound
  // into the initialization context from persistent server records — eliminating
  // hardcoded UI drift on browser refresh.
  //
  // widget_config.branding contains the canonical visual profile (primaryColor,
  // accentColor, logoUrl, widgetBodyOpacity, widgetBodyBackground) written by the
  // sync_tenant_config RPC.
  // widget_config.features contains the functional flag matrix (aiInsightBadge,
  // aiDesignMirror, customCss).
  const initialBrandingConfig = clientData
    ? (() => {
        const widgetConfig = (clientData as Record<string, unknown>).widget_config as Record<string, unknown> | undefined;
        const branding = (widgetConfig?.branding || {}) as Record<string, unknown>;
        const features = (widgetConfig?.features || {}) as Record<string, unknown> | undefined;
        const suggestedActionsRaw = (widgetConfig?.suggestedActions as unknown[] | undefined) ?? [];

        return {
          branding: {
            headerBackground: (branding.primaryColor as string) || clientData.branding_colors?.primary || '#0097b2',
            footerBackground: (branding.accentColor as string) || clientData.branding_colors?.secondary || '#050a14',
            headerImage: clientData.custom_assets?.header_url || '',
            footerImage: clientData.custom_assets?.footer_url || '',
            logoUrl: (branding.logoUrl as string) || '',
            widgetBodyOpacity: (branding.widgetBodyOpacity as number) ?? 1.0,
            widgetBodyBackground: (branding.widgetBodyBackground as string) || 'rgba(31, 41, 55, 1.0)',
          },
          features: features as {
            aiInsightBadge?: boolean;
            aiDesignMirror?: boolean;
            customCss?: boolean;
          } | undefined,
          suggestedActions: suggestedActionsRaw as SuggestedAction[],
        };
      })()
    : {};

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-white/60">Loading Branding Studio...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-red-400">Error: {error}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-7xl mx-auto">
        <div className="relative overflow-hidden rounded-xl mb-8 min-h-[120px]">
          {/* Background Image */}
          <Image
            src="/reseller-bg.jpg"
            alt=""
            aria-hidden="true"
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
          {/* High-Performance Contrast Shield Layer */}
          <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-950/60 to-transparent pointer-events-none" />
          {/* Foreground Typography */}
          <div className="relative z-10 p-6">
            <h1 className="text-2xl font-bold text-white mb-2">Branding Studio</h1>
            <p className="text-white/90">Customize widget appearance for {clientData?.name}</p>
          </div>
        </div>
        <ClientBrandingStudio
          key={resellerSlug}
          clientId={clientId}
          resellerSlug={resellerSlug}
          initialConfig={initialBrandingConfig}
          planTier={clientData?.pricing_tier_key || 'standard'}
          clients={allClients}
          onClientChange={handleClientChange}
        />
        <IntegrationSuite
          key={clientId}
          tenantId={clientId}
          initialEnabled={integrationState.enabled}
          initialProviderType={integrationState.providerType}
        />
      </div>
    </div>
  );
}