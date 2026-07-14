'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { useRef, useState, useEffect } from 'react';
import { OverlayController } from '@/components/client/OverlayController';
import { ZeederProvider, type ZeederClientProfile } from '@/contexts/ZeederContext';
import { StudioDraftProvider } from '@/contexts/StudioDraftContext';
import SystemMicButton from '@/components/ui/zeeder/SystemMicButton';
import { createClient as createSupabaseClient } from '@/lib/supabase/client';
import { resolveClientSlug } from '@/lib/db/resolve-client-slug';

type CommandIntent = 'list_capabilities' | 'view_status' | 'get_help' | 'show_analytics' | null;

export default function ClientLayout({ children }: { children: ReactNode }) {
  const overlayRef = useRef<{ openCommands: () => void } | null>(null);
  const [commandIntent, setCommandIntent] = useState<CommandIntent>(null);
  const [clientProfile, setClientProfile] = useState<ZeederClientProfile | null>(null);
  const [transcript, setTranscript] = useState('');
  const [isRecording, setIsRecording] = useState(false);

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
          id: session.user.id,
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

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Lock body scroll while the mobile slide-out sheet is open.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.body.style.overflow = mobileMenuOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileMenuOpen]);

  return (
    <StudioDraftProvider>
    <ZeederProvider clientProfile={clientProfile ?? undefined}>
    <div className="font-agrandir antialiased text-white min-h-screen bg-transparent overflow-x-clip flex flex-col">
      {/* Fixed Background Matrix — binary/code matrix bleed with deep dark preservation */}
      <div className="fixed top-0 left-0 w-[100vw] h-[100vh] z-[-10] bg-[url('/clientsbg.jpg')] bg-cover bg-center bg-no-repeat">
        <div className="absolute inset-0 bg-black/60" />
      </div>

      {/* Responsive Header Bar — collapses to a slide-out sheet below md */}
      <header className="w-full flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-800/40 bg-black/30 backdrop-blur-xl">
        {/* Left cluster: brand identity */}
        <div className="flex items-center gap-3 min-w-0">
          {/* POWERED BY ZEEDER AI — hidden on mobile */}
          <div className="hidden md:flex items-center gap-1.5 shrink-0">
            <span className="text-zinc-400 text-[9px] tracking-[0.18em] uppercase font-light">
              POWERED BY ZEEDER
            </span>
            <span className="text-[#FFD700] text-[9px] font-bold uppercase animate-pulse drop-shadow-[0_0_10px_rgba(255,215,0,0.4)]">
              AI
            </span>
          </div>

          {/* ZEEDER engage block */}
          <div className="flex items-center gap-1 shrink-0">
            <span className="text-zinc-300 text-[8.5px] md:text-[9.5px] tracking-[0.18em] uppercase font-light">
              ZEEDER
            </span>
            <span className="text-cyan-400 font-bold text-[8.5px] md:text-[9.5px] lowercase animate-pulse">
              engage
            </span>
          </div>
        </div>

        {/* Right cluster: nav links (desktop) + persistent mic + status / menu toggle */}
        <div className="flex items-center gap-2 md:gap-6">
          {/* Settings triggers — routed to dedicated Studio pages (desktop only) */}
          <div className="hidden md:flex items-center gap-2 whitespace-nowrap">
            <Link
              href="/client/dashboard/studio/branding"
              className="text-[8.5px] md:text-[9.5px] tracking-[0.18em] uppercase font-light text-zinc-400 hover:text-cyan-400 transition-colors"
              aria-label="Open Branding Studio"
            >
              Branding
            </Link>
            <Link
              href="/client/dashboard/studio/persona"
              className="text-[8.5px] md:text-[9.5px] tracking-[0.18em] uppercase font-light text-zinc-400 hover:text-cyan-400 transition-colors"
              aria-label="Open AI Persona Settings"
            >
              Persona
            </Link>
          </div>

          {/* System Mic Button — ZEEDER PTT trigger (always visible) */}
          <div className="flex items-center">
            <SystemMicButton
              onTranscriptChange={setTranscript}
              onRecordingStateChange={setIsRecording}
            />
          </div>

          {/* Navigation status (desktop only) */}
          <div className="hidden md:flex items-center gap-1.5 whitespace-nowrap">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
            <span className="text-zinc-400 text-[8.5px] md:text-[9.5px] tracking-[0.18em] uppercase font-light">
              Dashboard
            </span>
          </div>

          {/* Mobile menu toggle — opens the slide-out sheet */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Open menu"
            aria-expanded={mobileMenuOpen}
            className="md:hidden flex items-center justify-center w-11 h-11 rounded-lg border border-white/10 bg-slate-950/40 text-white hover:border-white/20 transition-colors"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
        </div>
      </header>

      {/* Mobile slide-out sheet (< md) */}
      {mobileMenuOpen && (
        <div
          className="md:hidden fixed inset-0 z-50"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation menu"
        >
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setMobileMenuOpen(false)}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          <div className="absolute top-0 right-0 h-full w-64 max-w-[80vw] bg-slate-950/95 backdrop-blur-xl border-l border-white/10 shadow-2xl flex flex-col">
            <div className="flex items-center justify-between px-4 py-4 border-b border-white/10">
              <span className="text-[9px] tracking-[0.18em] uppercase text-zinc-400 font-agrandir">
                Menu
              </span>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Close menu"
                className="flex items-center justify-center w-11 h-11 -mr-2 rounded-lg text-zinc-300 hover:bg-white/5 transition-colors"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <nav className="flex flex-col p-3 gap-1">
              <Link
                href="/client/dashboard/studio/branding"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center min-h-[44px] px-4 rounded-xl text-xs tracking-[0.18em] uppercase font-light text-zinc-300 hover:text-cyan-400 hover:bg-white/5 transition-colors font-agrandir"
              >
                Branding
              </Link>
              <Link
                href="/client/dashboard/studio/persona"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center min-h-[44px] px-4 rounded-xl text-xs tracking-[0.18em] uppercase font-light text-zinc-300 hover:text-cyan-400 hover:bg-white/5 transition-colors font-agrandir"
              >
                Persona
              </Link>
            </nav>

            <div className="mt-auto px-4 py-4 border-t border-white/10 flex items-center gap-1.5">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
              <span className="text-zinc-400 text-[9px] tracking-[0.18em] uppercase font-light">
                Dashboard
              </span>
            </div>
          </div>
        </div>
      )}

      {/* STT Layer - Dedicated full-width container beneath header */}
      <div className="w-full px-4 mt-2 h-5 flex items-center justify-center">
        <span className={`text-[#0097b2]/60 text-[10px] font-mono uppercase tracking-tight italic transition-opacity duration-200 ${
          transcript || isRecording ? 'opacity-100' : 'opacity-30'
        }`}>
          {transcript ? `Detected: "${transcript}"` : (isRecording ? 'Listening...' : '\u2009')}
        </span>
      </div>

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