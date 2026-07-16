'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { useParams } from 'next/navigation';
import { isInvalidSlug } from '@/lib/utils/guard';
import { IntegrationsManager } from '@/components/studio/IntegrationsManager';

export default function ClientIntegrationsPage() {
  const params = useParams();
  // CRITICAL: String() coercion — useParams() may return a Proxy during SSR.
  const clientId = String(params.clientId ?? '');

  const [isLoading, setIsLoading] = useState(true);
  const [clientName, setClientName] = useState<string>('');

  useEffect(() => {
    let active = true;
    async function fetchData() {
      try {
        if (!clientId || isInvalidSlug(clientId)) return;
        const response = await fetch(`/api/tenants/${clientId}`);
        if (response.ok && active) {
          const data = await response.json();
          setClientName(data?.name ?? '');
        }
      } catch {
        // Non-fatal: keep the empty label.
      } finally {
        if (active) setIsLoading(false);
      }
    }
    void fetchData();
    return () => {
      active = false;
    };
  }, [clientId]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-white/60">Loading Integrations Manager…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-7xl mx-auto">
        <div className="relative overflow-hidden rounded-xl mb-8 min-h-[120px]">
          <Image
            src="/reseller-bg.jpg"
            alt=""
            aria-hidden="true"
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-950/60 to-transparent pointer-events-none" />
          <div className="relative z-10 p-6">
            <h1 className="text-2xl font-bold text-white mb-2">Integrations Manager</h1>
            <p className="text-white/90">
              Configure premium add-ons for {clientName || 'this client'}
            </p>
          </div>
        </div>

        <IntegrationsManager role="reseller" targetClientId={clientId} />
      </div>
    </div>
  );
}
