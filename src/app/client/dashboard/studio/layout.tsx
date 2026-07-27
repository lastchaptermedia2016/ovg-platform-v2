'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { BackButton } from '@/components/ui/BackButton';
import { WidgetPreview } from '@/components/studio/WidgetPreview';
import { VoiceMicIndicator } from '@/components/studio/VoiceMicIndicator';
import { CapabilitiesModal } from '@/components/studio/CapabilitiesModal';
import { CapabilitiesBridge } from '@/components/studio/CapabilitiesBridge';
import { VoiceProvider } from '@/providers/voice-provider';
import {
  Settings,
  MessageCircle,
  FileText,
  Puzzle,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { AuthContext } from '@/lib/actions/auth-middleware';

interface NavItem {
  href: string;
  label: string;
  description: string;
  accentColor: string;
  borderColor: string;
  glowColor: string;
  iconBg: string;
  iconColor: string;
  icon: React.ElementType;
  inactiveBg: string;
}

const navItems: NavItem[] = [
  {
    href: '/client/dashboard/studio/branding',
    label: 'Branding',
    description: 'Colors, logo, and visual identity',
    accentColor: '#06b6d4',
    borderColor: 'rgba(6, 182, 212, 0.45)',
    glowColor: 'rgba(6, 182, 212, 0.35)',
    iconBg: 'rgba(6, 182, 212, 0.18)',
    iconColor: '#22d3ee',
    icon: Settings,
    inactiveBg: 'rgba(6, 182, 212, 0.12)',
  },
  {
    href: '/client/dashboard/studio/persona',
    label: 'Persona',
    description: 'AI behavior, tone, and voice',
    accentColor: '#f59e0b',
    borderColor: 'rgba(245, 158, 11, 0.45)',
    glowColor: 'rgba(245, 158, 11, 0.35)',
    iconBg: 'rgba(245, 158, 11, 0.18)',
    iconColor: '#fbbf24',
    icon: MessageCircle,
    inactiveBg: 'rgba(245, 158, 11, 0.12)',
  },
  {
    href: '/client/dashboard/studio/knowledge',
    label: 'Knowledge',
    description: 'FAQ, policies, and training content',
    accentColor: '#a855f7',
    borderColor: 'rgba(168, 85, 247, 0.45)',
    glowColor: 'rgba(168, 85, 247, 0.35)',
    iconBg: 'rgba(168, 85, 247, 0.18)',
    iconColor: '#c084fc',
    icon: FileText,
    inactiveBg: 'rgba(168, 85, 247, 0.12)',
  },
  {
    href: '/client/dashboard/studio/integrations',
    label: 'Integrations',
    description: 'Smart booking, CRM, commerce & knowledge add-ons',
    accentColor: '#10b981',
    borderColor: 'rgba(16, 185, 129, 0.45)',
    glowColor: 'rgba(16, 185, 129, 0.35)',
    iconBg: 'rgba(16, 185, 129, 0.18)',
    iconColor: '#34d399',
    icon: Puzzle,
    inactiveBg: 'rgba(16, 185, 129, 0.12)',
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
    <>
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
    </>
  );
}

function StudioShell({ pathname, children }: { pathname: string; children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 md:px-8 pt-6 md:pt-10 pb-24 md:pb-10">
      <div className="sticky top-0 z-20 -mx-4 md:-mx-8 px-4 md:px-8 pt-3 pb-4 mb-6 bg-black/40 backdrop-blur-xl border-b border-white/5">
        <BackButton />
        <div className="mt-3">
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
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Studio Navigation Cards */}
        <aside className="w-full lg:w-64 shrink-0 space-y-3">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="block rounded-2xl border p-4 transition-all duration-300 hover:scale-[1.01]"
                style={{
                  backgroundColor: isActive ? `${item.accentColor}10` : item.inactiveBg,
                  borderColor: isActive ? item.borderColor : `${item.accentColor}25`,
                  boxShadow: isActive ? `0 0 24px ${item.glowColor}` : `0 0 10px ${item.glowColor}`,
                  backdropFilter: 'blur(16px)',
                }}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-8 w-8 items-center justify-center rounded-lg"
                    style={{
                      backgroundColor: item.iconBg,
                      color: isActive ? item.iconColor : `${item.accentColor}cc`,
                    }}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-white font-agrandir block">
                      {item.label}
                    </span>
                    <span className="text-[10px] text-slate-300 font-medium font-agrandir">
                      {item.description}
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
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
