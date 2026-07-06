'use client';

import type { ReactNode } from 'react';
import { useRef, useState, useEffect } from 'react';
import { OverlayController } from '@/components/client/OverlayController';
import { ZeederProvider, type ZeederClientProfile } from '@/contexts/ZeederContext';
import { StudioDraftProvider } from '@/contexts/StudioDraftContext';
import SystemMicButton from '@/components/ui/zeeder/SystemMicButton';
import { createClient as createSupabaseClient } from '@/lib/supabase/client';
import { resolveClientSlug } from '@/lib/db/resolve-client-slug';

type CommandIntent = 'list_capabilities' | 'view_status' | 'get_help' | 'show_analytics' | null;

export default function ClientLayout({ children }: { children: ReactNode }) {
  const overlayRef = useRef<{ openBranding: () => void; openPersona: () => void; openCommands: () => void } | null>(null);
  const [commandIntent, setCommandIntent] = useState<CommandIntent>(null);
  const [clientProfile, setClientProfile] = useState<ZeederClientProfile | null>(null);

  // ── Fetch authenticated client identity ────────────────────────────
  useEffect(() => {
    const supabase = createSupabaseClient();

    supabase.auth.getSession().then(async ({ data }) => {
      const session = data.session;
      console.log('[TRACE ClientLayout] Session:', session?.user?.id);
      console.log('[TRACE ClientLayout] User:', session?.user?.email);
      if (session?.user) {
        const { data: slugResult, error } = await resolveClientSlug(session.user.id);
        console.log('[TRACE ClientLayout] resolveClientSlug result:', { slugResult, error });

        if (error) {
          console.error('[ClientLayout] Failed to resolve client slug:', error.message);
          throw error;
        }

        if (!slugResult) {
          const err = new Error('Reseller slug is missing - cannot initialize client profile');
          console.error('[ClientLayout]', err.message);
          throw err;
        }

        const profile = {
          name: session.user.user_metadata?.name ?? session.user.email?.split('@')[0] ?? 'Client',
          email: session.user.email ?? '',
          resellerSlug: slugResult,
          lastLogin: session.user.last_sign_in_at ?? undefined,
        };
        console.log('[TRACE ClientLayout] Setting clientProfile:', profile);
        setClientProfile(profile);
      }
    });
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handler = (event: MessageEvent) => {
      let eventData = event.data;

      // Handle both stringified and object payloads
      if (typeof eventData === 'string') {
        try {
          eventData = JSON.parse(eventData);
        } catch {
          return; // Not valid JSON
        }
      }

      if (eventData?.type === 'hannah:intent-command') {
        const data = (eventData as Record<string, unknown>).data as Record<string, unknown> | undefined;
        const intentRaw = data?.intent;
        if (typeof intentRaw === 'string') {
          setCommandIntent(intentRaw as CommandIntent);
        }
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  return (
    <StudioDraftProvider>
    <ZeederProvider clientProfile={clientProfile ?? undefined}>
    <div className="font-agrandir antialiased text-white min-h-screen bg-transparent overflow-x-hidden flex flex-col">
      {/* Fixed Background Matrix — binary/code matrix bleed with deep dark preservation */}
      <div className="fixed top-0 left-0 w-[100vw] h-[100vh] z-[-10] bg-[url('/clientsbg.jpg')] bg-cover bg-center bg-no-repeat bg-fixed">
        <div className="absolute inset-0 bg-black/60" />
      </div>

      {/* Responsive Header Bar — layout-matched premium template */}
      <header className="w-full flex justify-between items-center px-4 py-3 whitespace-nowrap border-b border-slate-800/40 bg-black/30 backdrop-blur-xl">
        {/* Far-Left Branding: POWERED BY ZEEDER AI — hidden on mobile */}
        <div className="hidden sm:flex items-center gap-1.5 shrink-0">
          <span className="text-zinc-400 text-[9px] tracking-[0.18em] uppercase font-light">
            POWERED BY ZEEDER
          </span>
          <span className="text-[#FFD700] text-[9px] font-bold uppercase animate-pulse drop-shadow-[0_0_10px_rgba(255,215,0,0.4)]">
            AI
          </span>
        </div>

        {/* Right Side: unified horizontal container */}
        <div className="flex items-center justify-between w-full sm:w-auto gap-3 sm:gap-6">
          {/* ZEEDER engage block (left-aligned within container) */}
          <div className="flex items-center gap-1">
            <span className="text-zinc-300 text-[8.5px] md:text-[9.5px] tracking-[0.18em] uppercase font-light">
              ZEEDER
            </span>
            <span className="text-cyan-400 font-bold text-[8.5px] md:text-[9.5px] lowercase animate-pulse">
              engage
            </span>
          </div>

          {/* Settings triggers */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => overlayRef.current?.openBranding()}
              className="text-[8.5px] md:text-[9.5px] tracking-[0.18em] uppercase font-light text-zinc-400 hover:text-cyan-400 transition-colors"
              aria-label="Open Branding Studio"
            >
              Branding
            </button>
            <button
              onClick={() => overlayRef.current?.openPersona()}
              className="text-[8.5px] md:text-[9.5px] tracking-[0.18em] uppercase font-light text-zinc-400 hover:text-cyan-400 transition-colors"
              aria-label="Open AI Persona Settings"
            >
              Persona
            </button>
          </div>

          {/* System Mic Button — ZEEDER PTT trigger */}
          <div className="flex items-center">
            <SystemMicButton />
          </div>

          {/* Navigation status (far-right) */}
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
            <span className="text-zinc-400 text-[8.5px] md:text-[9.5px] tracking-[0.18em] uppercase font-light">
              Dashboard
            </span>
          </div>
        </div>
      </header>

      {/* Page Content — flex-1 pushes footer to bottom */}
      <main className="flex-1 w-full">
        {children}
      </main>

      {/* Overlay Controller */}
      <OverlayController ref={overlayRef} commandIntent={commandIntent ?? undefined} onCommandClose={() => setCommandIntent(null)} clientProfile={clientProfile} />

      {/* Footer branding — sits naturally in flex flow below content */}
      <div className="flex justify-center pb-4">
        <div className="backdrop-blur-md bg-black/20 border border-white/5 whitespace-nowrap px-3 py-1 rounded-full">
          <span className="text-zinc-300 text-[8.5px] md:text-[9.5px] tracking-[0.18em] uppercase font-light">
            POWERED BY ZEEDER |{' '}
          </span>
          <span className="text-cyan-400 font-bold text-[8.5px] md:text-[9.5px] lowercase animate-pulse">
            engage
          </span>
        </div>
      </div>
    </div>
    </ZeederProvider>
    </StudioDraftProvider>
  );
}