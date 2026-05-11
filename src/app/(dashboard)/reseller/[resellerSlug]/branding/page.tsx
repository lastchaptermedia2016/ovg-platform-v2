'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ClientBrandingStudio } from '@/components/reseller/ClientBrandingStudio';
import type { Client } from '@/types';

export default function ResellerBrandingPage() {
  const params = useParams();
  const router = useRouter();
  const resellerSlug = params.resellerSlug as string;

  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

    if (resellerSlug) {
      fetchClients();
    }
  }, [resellerSlug]);

  const handleClientChange = (clientId: string) => {
    setSelectedClientId(clientId);
    router.push(`/reseller/${resellerSlug}/branding?client=${clientId}`);
    console.log("OVG-PLATFORM-V2: Client switched to", clientId);
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
          <p className="text-white/60">Customize widget appearance for your clients</p>
        </div>

        {selectedClientId ? (
          <ClientBrandingStudio
            clientId={selectedClientId}
            resellerSlug={resellerSlug}
            clients={clients}
            onClientChange={handleClientChange}
            initialConfig={{}}
            planTier="standard"
          />
        ) : (
          <div className="text-white/60">No clients found</div>
        )}
      </div>
    </div>
  );
}
