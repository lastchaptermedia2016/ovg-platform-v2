'use client';

import { useEffect } from 'react';
import { FEATURE_REGISTRY } from '@/lib/audit/feature-registry';

export interface ClientHelpModalProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Zeeder Client capabilities modal, elevated from the legacy speech-only
 * SYSTEM_HELP response into a visual UI surface.
 *
 * Renders the authoritative capability list sourced from `FEATURE_REGISTRY`,
 * so the UI stays in sync with what the AI process-command pipeline can do.
 *
 * Pattern mirrors `src/components/studio/CapabilitiesModal.tsx`: a soft,
 * non-blocking overlay that closes on backdrop click, Escape, or the close
 * button. Stacks above the DeploymentModal (z-50) at z-60.
 */
export function ClientHelpModal({ open, onClose }: ClientHelpModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const capabilities = Object.values(FEATURE_REGISTRY);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Zeeder capabilities"
    >
      {/* Backdrop — clicking it dismisses the modal instantly. */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />

      <div className="relative w-full max-w-md rounded-2xl border border-white/10 bg-slate-950/95 p-5 shadow-[0_0_50px_rgba(0,229,255,0.15)]">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">Zeeder Capabilities</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close capabilities"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-zinc-400 hover:text-white"
          >
            ✕
          </button>
        </div>

        <p className="mt-1 text-[11px] text-zinc-500">
          Ask &ldquo;what can you do?&rdquo; any time to reopen this list.
        </p>

        <ul className="mt-4 max-h-[60vh] space-y-2 overflow-y-auto pr-1">
          {capabilities.map((c) => (
            <li key={c.actionType} className="rounded-xl border border-white/5 bg-white/5 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-cyan-300">{c.actionType}</p>
                {c.requiresAuth && (
                  <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-amber-300">
                    auth
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-[11px] text-zinc-400">{c.description}</p>
            </li>
          ))}
        </ul>

        {/* Screen-reader live region: announces the panel opened. */}
        <p className="sr-only" aria-live="polite">
          Capabilities panel opened. You can close it with the Escape key or by pressing the close button.
        </p>
      </div>
    </div>
  );
}
