'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { X, ArrowRight } from 'lucide-react';
import {
  CLIENT_SYSTEM_REGISTRY,
  CLIENT_SYSTEM_TABS,
  type ClientSystemCategory,
} from '@/lib/client-system-registry';

type CommandIntent = 'list_capabilities' | 'view_status' | 'get_help' | 'show_analytics';

interface ClientSystemModalProps {
  open: boolean;
  onClose: () => void;
  /** Tab shown when the modal opens. */
  defaultCategory?: ClientSystemCategory;
  /**
   * Retained for voice-command parity (OverlayController passes the detected
   * intent). All prior intents were capability/status listings, so any value
   * maps to the General tab.
   */
  intent?: CommandIntent | null;
  /** Retained for import parity; ignored — client registry is client-scoped only. */
  clientProfile?: { resellerSlug?: string } | null;
}

/**
 * Unified client "Command Center". Renders the curated client-system-registry
 * as tabbed General / Branding / Persona views. Branding and Persona entries
 * carry a navigation action that routes the user to the existing, tested Studio
 * modules — the modal is a high-level navigation dashboard, not a config engine.
 */
export function ClientSystemModal({
  open,
  onClose,
  defaultCategory = 'general',
  intent,
  clientProfile: _clientProfile,
}: ClientSystemModalProps) {
  const router = useRouter();
  const initialCategory: ClientSystemCategory = intent ? 'general' : defaultCategory;
  const [active, setActive] = useState<ClientSystemCategory>(initialCategory);
  // The portal target (document.body) only exists in the browser. Referencing it
  // directly avoids an effect/setState and any hydration mismatch — the modal
  // renders null until `open` is true anyway, so first-render output matches SSR.
  const mounted = typeof document !== 'undefined';

  // Reset to the default tab each time the modal opens. Deferred via a macrotask
  // so setState is not called synchronously within the effect body (avoids the
  // react-hooks/set-state-in-effect lint error).
  useEffect(() => {
    if (!open) return;
    const id = setTimeout(() => setActive(initialCategory), 0);
    return () => clearTimeout(id);
  }, [open, initialCategory]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || !mounted) return null;

  const items = CLIENT_SYSTEM_REGISTRY[active];

  const navigate = (href: string) => {
    onClose();
    router.push(href);
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Zeeder system"
    >
      {/* Backdrop — clicking it dismisses the modal instantly. */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />

      <div className="relative w-full max-w-md rounded-2xl border border-white/10 bg-slate-950/95 p-5 shadow-[0_0_50px_rgba(0,229,255,0.15)]">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white font-agrandir">Zeeder System</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-zinc-400 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs */}
        <div role="tablist" className="mt-4 flex gap-1 rounded-lg border border-white/10 bg-slate-950/40 p-1">
          {CLIENT_SYSTEM_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active === tab.id}
              onClick={() => setActive(tab.id)}
              className={`flex-1 rounded-md px-3 py-1.5 text-[11px] font-semibold transition-colors font-agrandir ${
                active === tab.id ? 'bg-cyan-500/15 text-cyan-300' : 'text-zinc-400 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <ul className="mt-4 max-h-[60vh] space-y-2 overflow-y-auto pr-1">
          {items.map((item) => (
            <li key={item.id} className="rounded-xl border border-white/5 bg-white/5 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-cyan-300 font-agrandir">{item.label}</p>
                {item.requiresAuth && (
                  <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-amber-300">
                    auth
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-[11px] text-zinc-400">{item.description}</p>
              {item.action && (
                <button
                  type="button"
                  onClick={() => navigate(item.action!.href)}
                  className="mt-2 inline-flex items-center gap-1 rounded-lg border border-cyan-500/30 bg-cyan-500/15 px-2.5 py-1 text-[10px] font-semibold text-cyan-200 transition-colors hover:bg-cyan-500/25 font-agrandir"
                >
                  {item.action.label}
                  <ArrowRight className="h-3 w-3" />
                </button>
              )}
            </li>
          ))}
        </ul>

        {/* Screen-reader live region. */}
        <p className="sr-only" aria-live="polite">
          Client system panel opened. Use the tabs to switch between General, Branding, and Persona.
        </p>
      </div>
    </div>,
    document.body,
  );
}
