'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Image from 'next/image';
import { useParams, useRouter } from 'next/navigation';
import { isInvalidSlug } from '@/lib/utils/guard';
import { ClientBrandingStudio, BrandingConfig } from '@/components/reseller/ClientBrandingStudio';
import { IntegrationSuite } from '@/components/reseller/IntegrationSuite';
import type { BookingProviderType } from '@/interfaces/booking-provider.interface';
import type { Client } from '@/types';
import { useHannah } from '@/contexts/HannahContext';
import type { CommandCapability } from '@/core/ai/system-capabilities';

interface TenantRecord {
  id: string;
  name: string;
  pricing_tier_key?: string;
  metadata?: unknown;
  widget_config?: {
    branding?: Record<string, unknown>;
    features?: {
      aiInsightBadge?: boolean;
      aiDesignMirror?: boolean;
      customCss?: boolean;
    };
    integrations?: {
      booking?: {
        enabled?: boolean;
        providerType?: BookingProviderType;
      };
    };
  };
}

interface BookingIntegrationState {
  enabled: boolean;
  providerType: BookingProviderType;
}

function readBookingIntegrationState(tenant: TenantRecord | null): BookingIntegrationState {
  const metadataRecord = tenant?.metadata;
  const widgetRecord = tenant?.widget_config;

  if (metadataRecord && typeof metadataRecord === 'object' && !Array.isArray(metadataRecord)) {
    const integrations = (metadataRecord as Record<string, unknown>).integrations;
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

  const widgetBooking = widgetRecord?.integrations?.booking;

  return {
    enabled: widgetBooking?.enabled === true,
    providerType: widgetBooking?.providerType === 'EXTERNAL' ? 'EXTERNAL' : 'INTERNAL',
  };
}

export default function ResellerBrandingPage() {
  const params = useParams();
  const router = useRouter();
  // CRITICAL: Use String() runtime coercion, not TypeScript's compile-time `as string`.
  // useParams() can return a Proxy object during SSR/hydration that hasn't resolved
  // to a primitive string yet. String() ensures a primitve is always passed downstream.
  const resellerSlug = String(params.resellerSlug ?? '');

  // ── Hannah Context Integration ───────────────────────────────────────────
  const { setActiveCommands } = useHannah();

  // ── Initialization: State ──────────────────────────────────────────
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [integrationState, setIntegrationState] = useState<BookingIntegrationState>({
    enabled: false,
    providerType: 'INTERNAL',
  });

  // Hydrated state from the tenant record
  const [hydratedConfig, setHydratedConfig] = useState<Record<string, unknown>>({});
  const [hydratedPlanTier, setHydratedPlanTier] = useState<string>('standard');

  // Branding studio-specific command capabilities (static, memoized)
  const BRANDING_COMMANDS = useMemo<CommandCapability[]>(() => [
    {
      key: 'SYSTEM_UPDATE_BRANDING',
      name: 'Apply [vibe] archetype',
      description: 'Apply visual design changes such as colors, gradients, logos, and feature toggles.',
      examples: ['Make it cyberpunk neon', 'Set the logo to my image', 'Enable design mirror']
    },
    {
      key: 'SYNC_ASSETS',
      name: 'Synchronize asset buffers',
      description: 'Sync all branding assets to the active client configuration.',
      examples: ['Sync assets', 'Synchronize branding', 'Update assets']
    },
    {
      key: 'TOGGLE_GREETING',
      name: 'Toggle welcome greeting lock',
      description: 'Lock or unlock the welcome greeting configuration for this client.',
      examples: ['Lock greeting', 'Unlock welcome', 'Toggle greeting']
    }
  ], []);

  // ── Lifecycle: Register Branding Commands on Mount ───────────────────────
  useEffect(() => {
    setActiveCommands(BRANDING_COMMANDS);

    // Cleanup on unmount - clear commands when leaving page
    return () => {
      setActiveCommands([]);
    };
  }, [setActiveCommands, BRANDING_COMMANDS]);

  // Fetch clients list on mount
  useEffect(() => {
    async function fetchClients() {
      try {
        const response = await fetch(`/api/reseller/${resellerSlug}/clients`);
        if (!response.ok) throw new Error('Failed to fetch clients');
        const data = await response.json() as Client[];
        setClients(data);
        if (data.length > 0) {
          setSelectedClientId(data[0].id);
        }
        console.log("OVG-PLATFORM-V2: Reseller branding studio initialized for", resellerSlug);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setIsLoading(false);
      }
    }

    if (resellerSlug && !isInvalidSlug(resellerSlug)) {
      fetchClients();
    }
  }, [resellerSlug]);

  // Hydrate widget_config and plan tier when selectedClientId changes
  useEffect(() => {
    if (!selectedClientId) return;

    let isActive = true;

    async function hydrateFromServer() {
      try {
        const response = await fetch(`/api/tenants/${selectedClientId}`);
        if (!response.ok) throw new Error('Failed to fetch tenant configuration');

        const tenant: TenantRecord = await response.json();
        if (!isActive) return;

        const widgetConfig = (tenant.widget_config || {}) as Record<string, unknown>;
        const branding = (widgetConfig.branding || {}) as Record<string, unknown>;
        const headerConfig = (branding.headerConfig as Record<string, unknown> | undefined) || {};
        const footerConfig = (branding.footerConfig as Record<string, unknown> | undefined) || {};
        const features = widgetConfig.features as { aiInsightBadge?: boolean; aiDesignMirror?: boolean; customCss?: boolean } | undefined;

        setIntegrationState(readBookingIntegrationState(tenant));
        setHydratedConfig({
          branding: {
            headerBackground: (headerConfig.colorStart as string) || (branding.primaryColor as string) || (widgetConfig.theme as Record<string, unknown> | undefined)?.primary as string || '#0097b2',
            headerBackgroundType: (((headerConfig.type as string) === 'gradient' || (headerConfig.type as string) === 'solid' || (headerConfig.type as string) === 'image') ? headerConfig.type : 'solid') as 'solid' | 'gradient' | 'image',
            headerGradientStart: (headerConfig.colorStart as string) || (branding.headerGradientStart as string) || '#0097b2',
            headerGradientEnd: (headerConfig.colorEnd as string) || (branding.headerGradientEnd as string) || '#226683',
            headerImage: (headerConfig.image as string) || '',
            headerOpacity: (headerConfig.opacity as number | undefined) ?? (branding.headerOpacity as number | undefined) ?? 0.75,
            footerBackground: (footerConfig.colorStart as string) || (branding.accentColor as string) || (widgetConfig.theme as Record<string, unknown> | undefined)?.secondary as string || '#050a14',
            footerBackgroundType: (((footerConfig.type as string) === 'gradient' || (footerConfig.type as string) === 'solid' || (footerConfig.type as string) === 'image') ? footerConfig.type : 'solid') as 'solid' | 'gradient' | 'image',
            footerGradientStart: (footerConfig.colorStart as string) || (branding.footerGradientStart as string) || '#050a14',
            footerGradientEnd: (footerConfig.colorEnd as string) || (branding.footerGradientEnd as string) || '#1a1a2e',
            footerImage: (footerConfig.image as string) || '',
            footerOpacity: (footerConfig.opacity as number | undefined) ?? (branding.footerOpacity as number | undefined) ?? 0.75,
            logoUrl: (branding.logoUrl as string) || '',
            widgetBodyOpacity: (branding.widgetBodyOpacity as number | undefined) ?? 1.0,
            widgetBodyBackground: (branding.widgetBodyBackground as string) || 'rgba(31, 41, 55, 1.0)',
            brandName: (branding.brandName as string) || '',
          },
          features: features || {},
        });

        setHydratedPlanTier(tenant.pricing_tier_key || 'standard');

        console.log("OVG-PLATFORM-V2: Branding studio hydrated for", tenant.name);
      } catch (err) {
        console.error("OVG-PLATFORM-V2: Hydration failed, using defaults:", err);
        setHydratedConfig({});
        setHydratedPlanTier('standard');
      }
    }

    hydrateFromServer();

    return () => {
      isActive = false;
    };
  }, [selectedClientId]);

  const handleClientChange = useCallback((clientId: string) => {
    setSelectedClientId(clientId);
    router.push(`/reseller/${resellerSlug}/branding?client=${clientId}`);
    console.log("OVG-PLATFORM-V2: Client switched to", clientId);
  }, [resellerSlug, router]);

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
    <div className="min-h-screen p-4 sm:p-6">
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
            <p className="text-white/90">Customize widget appearance for your clients</p>
          </div>
        </div>

        {selectedClientId ? (
          <>
            <ClientBrandingStudio
              key={resellerSlug}
              clientId={selectedClientId}
              resellerSlug={resellerSlug}
              clients={clients}
              onClientChange={handleClientChange}
              initialConfig={hydratedConfig as { branding?: Partial<BrandingConfig>; features?: { aiInsightBadge?: boolean; aiDesignMirror?: boolean; customCss?: boolean } }}
              planTier={hydratedPlanTier}
            />
            <IntegrationSuite
              key={selectedClientId}
              tenantId={selectedClientId}
              initialEnabled={integrationState.enabled}
              initialProviderType={integrationState.providerType}
            />
          </>
        ) : (
          <div className="text-white/60">No clients found</div>
        )}
      </div>
    </div>
  );
}
