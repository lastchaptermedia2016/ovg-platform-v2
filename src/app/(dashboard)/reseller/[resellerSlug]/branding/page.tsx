'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { isInvalidSlug } from '@/lib/utils/guard';
import { ClientBrandingStudio, BrandingConfig } from '@/components/reseller/ClientBrandingStudio';
import type { Client } from '@/types';

interface TenantRecord {
  id: string;
  name: string;
  pricing_tier_key?: string;
  widget_config?: {
    branding?: Record<string, unknown>;
    features?: {
      aiInsightBadge?: boolean;
      aiDesignMirror?: boolean;
      customCss?: boolean;
    };
  };
}

export default function ResellerBrandingPage() {
  const params = useParams();
  const router = useRouter();
  // CRITICAL: Use String() runtime coercion, not TypeScript's compile-time `as string`.
  // useParams() can return a Proxy object during SSR/hydration that hasn't resolved
  // to a primitive string yet. String() ensures a primitve is always passed downstream.
  const resellerSlug = String(params.resellerSlug ?? '');

  // 🔷 Production Excellence: Detect Next.js hydration issues with route params
  if (isInvalidSlug(resellerSlug)) {
    console.error('%c[Pierre] ❌ Route parameter failed to resolve (branding):', 'color: #0097b2; font-weight: bold;', { resellerSlug, params });
  }

  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Hydrated state from the tenant record
  const [hydratedConfig, setHydratedConfig] = useState<Record<string, unknown>>({});
  const [hydratedPlanTier, setHydratedPlanTier] = useState<string>('standard');

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

        // Map widget_config.branding and features into InitialConfig shape
        const widgetConfig = tenant.widget_config || {};
        const branding = widgetConfig.branding as Record<string, unknown> | undefined;
        const features = widgetConfig.features as { aiInsightBadge?: boolean; aiDesignMirror?: boolean; customCss?: boolean } | undefined;

        setHydratedConfig({
          branding: branding || {},
          features: features || {},
        });

        setHydratedPlanTier(tenant.pricing_tier_key || 'standard');

        console.log("OVG-PLATFORM-V2: Branding studio hydrated for", tenant.name);
      } catch (err) {
        console.error("OVG-PLATFORM-V2: Hydration failed, using defaults:", err);
        setHydratedConfig({});
        setHydratedPlanTier('standard');
      } finally {
        // Cleanup complete; no synchronous setState needed
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
    <div className="min-h-screen p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white mb-2">Branding Studio</h1>
          <p className="text-white/60">Customize widget appearance for your clients</p>
        </div>

        {selectedClientId ? (
          <ClientBrandingStudio
            key={resellerSlug}
            clientId={selectedClientId}
            resellerSlug={resellerSlug}
            clients={clients}
            onClientChange={handleClientChange}
            initialConfig={hydratedConfig as { branding?: Partial<BrandingConfig>; features?: { aiInsightBadge?: boolean; aiDesignMirror?: boolean; customCss?: boolean } }}
            planTier={hydratedPlanTier}
          />
        ) : (
          <div className="text-white/60">No clients found</div>
        )}
      </div>
    </div>
  );
}
