'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ClientBrandingStudio } from '@/components/reseller/ClientBrandingStudio';

export default function ClientBrandingPage() {
  const params = useParams();
  const router = useRouter();
  const resellerSlug = params.resellerSlug as string;
  const clientId = params.clientId as string;

  const [isLoading, setIsLoading] = useState(true);
  const [clientData, setClientData] = useState<any>(null);
  const [allClients, setAllClients] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        // Fetch current client data
        const clientResponse = await fetch(`/api/tenants/${clientId}`);
        if (!clientResponse.ok) throw new Error('Failed to fetch client data');
        const clientData = await clientResponse.json();
        setClientData(clientData);

        // Fetch all reseller clients
        const clientsResponse = await fetch(`/api/reseller/${resellerSlug}/clients`);
        if (!clientsResponse.ok) throw new Error('Failed to fetch clients');
        const clientsData = await clientsResponse.json();
        setAllClients(clientsData);

        console.log("OVG-PLATFORM-V2: Client branding studio initialized for", clientData.name);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    }

    if (clientId) {
      fetchData();
    }
  }, [clientId, resellerSlug]);

  const handleClientChange = (newClientId: string) => {
    router.push(`/reseller/${resellerSlug}/clients/${newClientId}/branding`);
  };

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
          clientId={clientId}
          resellerSlug={resellerSlug}
          initialConfig={clientData?.tenant_config || {}}
          planTier={clientData?.pricing_tier_key || 'standard'}
          clients={allClients}
          onClientChange={handleClientChange}
        />
      </div>
    </div>
  );
}
