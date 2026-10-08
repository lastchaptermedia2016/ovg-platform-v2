'use client';

/**
 * /client/dashboard/appointments
 *
 * Appointment Requests page — follows the same hydration pattern as
 * src/app/client/dashboard/page.tsx:
 *   1. Server layout (dashboard/layout.tsx) writes __INITIAL_SESSION__ to DOM.
 *   2. This client page reads it, verifies the session, and passes
 *      tenantId + accessToken down to the dashboard component.
 */

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { resolveTenantId } from '@/lib/resolveTenantId';
import { AppointmentsDashboard } from '@/components/appointments/AppointmentsDashboard';
import { BackButton } from '@/components/ui/BackButton';

interface InitialSession {
  tenantId: string | null;
  access_token?: string | null;
  user?: { id: string; email?: string };
}

function readInitialSession(): InitialSession | null {
  if (typeof document === 'undefined') return null;
  const el = document.getElementById('__INITIAL_SESSION__');
  if (!el?.textContent) return null;
  try {
    return JSON.parse(el.textContent) as InitialSession;
  } catch {
    return null;
  }
}

export default function AppointmentsPage() {
  const initial = readInitialSession();
  const [tenantId, setTenantId] = useState<string>(initial?.tenantId ?? '');
  const [accessToken, setAccessToken] = useState<string | null>(
    initial?.access_token ?? null,
  );
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(id);
  }, []);

  useEffect(() => {
    const verify = async () => {
      const supabase = createClient();
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        window.location.replace('/client-auth');
        return;
      }
      if (!accessToken) setAccessToken(data.session.access_token);
      if (!tenantId) {
        const { data: resolved } = await resolveTenantId(data.session.user.id);
        if (resolved) setTenantId(resolved);
      }
    };
    verify();
  }, [tenantId, accessToken]);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 sm:px-6 pt-6 pb-24">
      {/* Back nav */}
      <div className="mb-4">
        <BackButton />
      </div>

      {mounted && tenantId ? (
        <AppointmentsDashboard tenantId={tenantId} accessToken={accessToken} />
      ) : (
        <div className="flex items-center justify-center py-24">
          <span className="text-xs text-zinc-500 font-agrandir animate-pulse">
            Loading…
          </span>
        </div>
      )}
    </main>
  );
}
