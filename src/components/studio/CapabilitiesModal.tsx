'use client';

import { useEffect } from 'react';

export interface CapabilitiesModalProps {
  open: boolean;
  onClose: () => void;
}

const CAPABILITIES: { title: string; detail: string }[] = [
  { title: 'Branding & Colors', detail: 'Update header/footer colors, gradients, logo, and widget position.' },
  { title: 'AI Persona', detail: 'Tune the assistant voice, tone, temperature, and conversation style.' },
  { title: 'AI Insights Badge', detail: 'Surface proactive suggestions inside the widget.' },
  { title: 'Design Mirror', detail: 'Get live, on-brand layout recommendations as you edit.' },
  { title: 'Custom CSS', detail: 'Fine-tune the widget with your own styles.' },
];

/**
 * Soft overlay listing what the voice colleague can do. It is intentionally
 * non-blocking: closes on backdrop click, Escape, or the close button, and never
 * interrupts an in-progress task. The AI opens it only by emitting a UI trigger
 * signal — never by manipulating the DOM itself.
 */
export function CapabilitiesModal({ open, onClose }: CapabilitiesModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Zeeder capabilities"
    >
      {/* Backdrop — clicking it dismisses the soft overlay instantly. */}
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

        <ul className="mt-4 space-y-2">
          {CAPABILITIES.map((c) => (
            <li key={c.title} className="rounded-xl border border-white/5 bg-white/5 p-3">
              <p className="text-xs font-semibold text-cyan-300">{c.title}</p>
              <p className="mt-0.5 text-[11px] text-zinc-400">{c.detail}</p>
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
