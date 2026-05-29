'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { isInvalidSlug } from '@/lib/utils/guard';
import { ClientBrandingStudio } from '@/components/reseller/ClientBrandingStudio';
import type { Client, Tenant } from '@/types';

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

  useEffect(() => {
    async function fetchData() {
      try {
        // Fetch current client data
        const clientResponse = await fetch(`/api/tenants/${clientId}`);
        if (!clientResponse.ok) throw new Error('Failed to fetch client data');
        const clientDataResult = await clientResponse.json() as Tenant;
        setClientData(clientDataResult);

        // Fetch all reseller clients
        const clientsResponse = await fetch(`/api/reseller/${resellerSlug}/clients`);
        if (!clientsResponse.ok) throw new Error('Failed to fetch clients');
        const clientsDataResult = await clientsResponse.json() as Client[];
        setAllClients(clientsDataResult);

        console.log("OVG-PLATFORM-V2: Client branding studio initialized for", clientDataResult.name);
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

  const handleClientChange = (newClientId: string) => {
    router.push(`/reseller/${resellerSlug}/clients/${newClientId}/branding`);
  };

  const initialBrandingConfig = clientData
    ? {
        branding: {
          headerBackground: clientData.branding_colors?.primary || '#0097b2',
          footerBackground: clientData.branding_colors?.secondary || '#050a14',
          headerImage: clientData.custom_assets?.header_url || '',
          footerImage: clientData.custom_assets?.footer_url || '',
        },
      }
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
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white mb-2">Branding Studio</h1>
          <p className="text-white/60">Customize widget appearance for {clientData?.name}</p>
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
      </div>
    </div>
  );
}
