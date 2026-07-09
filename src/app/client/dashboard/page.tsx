'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { resolveTenantId } from '@/lib/resolveTenantId';
import TelemetryGrid from '@/components/dashboard/TelemetryGrid';
import SystemStatusMonitor from '@/components/dashboard/SystemStatusMonitor';
import ControlPanel from '@/components/dashboard/ControlPanel';
import { LiveChat } from '@/components/ui/LiveChat';

export default function ClientDashboardPage() {
  const router = useRouter();
  const [tenantId, setTenantId] = useState<string>('');

  useEffect(() => {
    const verifyAuth = async () => {
      const supabase = createClient();
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        router.replace('/client-auth');
        return;
      }
      const { data: resolvedTenantId } = await resolveTenantId(data.session.user.id);
      if (resolvedTenantId) {
        setTenantId(resolvedTenantId);
      }
    };
    verifyAuth();
  }, [router]);

  return (
    <main className="flex flex-col gap-6">
      <TelemetryGrid tenantId={tenantId} />
      <SystemStatusMonitor statusItems={[]} />
      <ControlPanel pipelineLayers={[]} autoSync={false} realtimeUpdates={false} />
      <LiveChat tenantId={tenantId} />
    </main>
  );
}
