'use client';

import { createClient } from '@/lib/supabase/client';
import { resolveTenantId } from '@/lib/resolveTenantId';
import TelemetryGrid from '@/components/dashboard/TelemetryGrid';
import SystemStatusMonitor from '@/components/dashboard/SystemStatusMonitor';
import ControlPanel from '@/components/dashboard/ControlPanel';
import { LiveChat } from '@/components/ui/LiveChat';
import { useEffect, useState } from 'react';

function readInitialSession() {
  if (typeof document === 'undefined') return null;
  const el = document.getElementById('__INITIAL_SESSION__');
  if (!el?.textContent) return null;
  try {
    return JSON.parse(el.textContent);
  } catch {
    return null;
  }
}

export default function ClientDashboardPage() {
  const initial = readInitialSession();
  const [tenantId, setTenantId] = useState<string>(initial?.tenantId || '');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(id);
  }, []);

  useEffect(() => {
    const verifyAuth = async () => {
      const supabase = createClient();
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        window.location.replace('/client-auth');
        return;
      }
      if (!tenantId) {
        const { data: resolvedTenantId } = await resolveTenantId(data.session.user.id);
        if (resolvedTenantId) {
          setTenantId(resolvedTenantId);
        }
      }
    };
    verifyAuth();
  }, [tenantId]);

  return (
    <main className="flex flex-col gap-6">
      <TelemetryGrid tenantId={tenantId} />
      <SystemStatusMonitor statusItems={[]} />
      <ControlPanel pipelineLayers={[]} autoSync={false} realtimeUpdates={false} />
      {mounted && (
        <LiveChat tenantId={tenantId} accessToken={initial?.access_token} />
      )}
    </main>
  );
}
