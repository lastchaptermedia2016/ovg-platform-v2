'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { WidgetPreview } from '@/components/studio/WidgetPreview';
import { VoiceMicIndicator } from '@/components/studio/VoiceMicIndicator';
import { CapabilitiesModal } from '@/components/studio/CapabilitiesModal';
import { CapabilitiesBridge } from '@/components/studio/CapabilitiesBridge';
import { StudioDraftProvider } from '@/contexts/StudioDraftContext';
import { VoiceProvider } from '@/providers/voice-provider';
import { createClient } from '@/lib/supabase/client';
import type { AuthContext } from '@/lib/actions/auth-middleware';

const navItems = [
  {
    href: '/client/dashboard/studio/branding',
    label: 'Branding',
    description: 'Colors, logo, and visual identity',
  },
  {
    href: '/client/dashboard/studio/persona',
    label: 'Persona',
    description: 'AI behavior, tone, and voice',
  },
];

/**
 * Resolve the caller's AuthContext on the client. We best-effort a tenantId so
 * the ActionRegistry can run authorization; if it can't be resolved the voice
 * layer still proposes drafts (the draft is never committed without a valid
 * context). Kept lightweight and failure-tolerant.
 */
function useClientAuthContext(): AuthContext | null {
  const [authContext, setAuthContext] = useState<AuthContext | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user || cancelled) return;

      let tenantId = '';
      try {
        const { data: link } = await supabase
          .from('user_resellers')
          .select('reseller_id')
          .eq('user_id', user.id)
          .maybeSingle();
        const resellerId = link?.reseller_id ?? user.user_metadata?.reseller_id;
        if (resellerId) {
          const { data: tenant } = await supabase
            .from('tenants')
            .select('id')
            .eq('reseller_id', resellerId)
            .limit(1)
            .maybeSingle();
          tenantId = tenant?.id ?? '';
        }
      } catch {
        tenantId = '';
      }

      if (!cancelled) {
        setAuthContext({
          userId: user.id,
          tenantId,
          role: user.user_metadata?.role,
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return authContext;
}

export default function StudioLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const authContext = useClientAuthContext();
  const supabase = createClient();
  const [capabilitiesOpen, setCapabilitiesOpen] = useState(false);

  return (
    <StudioDraftProvider>
      {authContext ? (
        <VoiceProvider
          authContext={authContext}
          supabase={supabase}
          onTriggerUI={(trigger) => {
            if (trigger === 'OPEN_CAPABILITIES') setCapabilitiesOpen(true);
          }}
        >
          <StudioShell pathname={pathname}>{children}</StudioShell>
          <VoiceMicIndicator />
          <CapabilitiesBridge onOpen={() => setCapabilitiesOpen(true)} />
          <CapabilitiesModal open={capabilitiesOpen} onClose={() => setCapabilitiesOpen(false)} />
        </VoiceProvider>
      ) : (
        <StudioShell pathname={pathname}>{children}</StudioShell>
      )}
    </StudioDraftProvider>
  );
}

function StudioShell({ pathname, children }: { pathname: string; children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-6 md:py-10">
      <div className="mb-6">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-cyan-400 font-agrandir">
          Client Portal
        </p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight text-white font-agrandir">
          Studio
        </h1>
        <p className="mt-1 text-xs text-zinc-400 font-agrandir">
          Configure your widget branding and AI persona.
        </p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Navigation Sidebar */}
        <aside className="w-full lg:w-64 shrink-0">
          <nav className="rounded-2xl border border-white/10 bg-slate-950/15 backdrop-blur-xl p-3 space-y-1">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex flex-col rounded-xl px-4 py-3 transition-colors ${
                    isActive
                      ? 'bg-cyan-500/10 border border-cyan-500/30'
                      : 'border border-transparent hover:bg-white/5 hover:border-white/10'
                  }`}
                >
                  <span
                    className={`text-xs font-semibold font-agrandir ${
                      isActive ? 'text-cyan-400' : 'text-white'
                    }`}
                  >
                    {item.label}
                  </span>
                  <span className="text-[10px] text-zinc-500 font-agrandir mt-0.5">
                    {item.description}
                  </span>
                </Link>
              );
            })}
          </nav>
        </aside>

        {/* Split-pane container */}
        <div className="flex-1 flex flex-col lg:flex-row gap-6 min-w-0">
          {/* Main Content Area */}
          <main className="flex-1 min-w-0">
            {children}
          </main>

          {/* Preview Sidebar */}
          <aside className="w-full lg:w-80 xl:w-96 shrink-0">
            <WidgetPreview />
          </aside>
        </div>
      </div>
    </div>
  );
}
