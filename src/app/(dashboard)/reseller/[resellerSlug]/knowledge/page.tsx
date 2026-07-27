'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { ResellerKnowledgeManager } from '@/components/reseller/ResellerKnowledgeManager';
import type { TenantSummary } from '@/components/reseller/ResellerKnowledgeManager';

export default function ResellerKnowledgePage() {
  const params = useParams();
  const resellerSlug = String(params.resellerSlug ?? '');
  const [tenants, setTenants] = useState<TenantSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!resellerSlug || resellerSlug === 'undefined') return;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/reseller/${encodeURIComponent(resellerSlug)}/clients`);
        if (!res.ok) throw new Error('Failed to fetch clients');
        const data = await res.json();
        if (!cancelled) {
          setTenants(
            (data ?? []).map((t: Record<string, unknown>) => ({
              id: t.id as string,
              name: t.name as string,
              ...(t.tenant_id !== undefined && { tenant_id: t.tenant_id as string | undefined }),
              ...(t.category !== undefined && { category: t.category as string | null | undefined }),
            }))
          );
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Unknown error');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [resellerSlug]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="text-white/60">Loading clients…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="text-red-400">Error: {error}</div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="max-w-7xl mx-auto">
        <div className="relative overflow-hidden rounded-xl mb-8 min-h-[120px]">
          <div
            className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-950/60 to-transparent pointer-events-none"
          />
          <div className="relative z-10 p-6">
            <h1 className="text-2xl font-bold text-white mb-2">Knowledge Base</h1>
            <p className="text-white/90">Manage FAQ articles, policies, and training content for your clients</p>
          </div>
        </div>

        <ResellerKnowledgeManager tenants={tenants} />
      </div>
    </div>
  );
}
