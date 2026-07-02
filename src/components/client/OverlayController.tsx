'use client';

import { useState, useCallback, useEffect, forwardRef, useImperativeHandle } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { BrandingStudio } from '@/components/client/BrandingStudio';
import AIPersonaSettings from '@/components/client/AIPersonaSettings';
import { CommandModal } from '@/components/client/CommandModal';

// ────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────
type OverlayView = 'branding' | 'persona' | 'commands' | null;

interface OverlayControllerProps {
  /** Optional initial view when mounted */
  defaultView?: OverlayView;
  /** Latest detected command intent to display */
  commandIntent?: 'list_capabilities' | 'view_status' | 'get_help' | 'show_analytics' | null;
  /** Called when the command modal requests close */
  onCommandClose?: () => void;
}

// ────────────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────────────
export const OverlayController = forwardRef<
  { openBranding: () => void; openPersona: () => void; openCommands: () => void },
  OverlayControllerProps
>(function OverlayController({ defaultView = null, commandIntent, onCommandClose }, ref) {
  const [view, setView] = useState<OverlayView>(defaultView);
  const [isMounted, setIsMounted] = useState(false);

  // Ensure portal target exists on client
  useEffect(() => {
    setIsMounted(true);
  }, []);

  const openBranding = useCallback(() => setView('branding'), []);
  const openPersona = useCallback(() => setView('persona'), []);
  const openCommands = useCallback(() => setView('commands'), []);
  const close = useCallback(() => setView(null), []);

  useImperativeHandle(ref, () => ({ openBranding, openPersona, openCommands }), [openBranding, openPersona, openCommands]);

  // Keyboard shortcut: Escape to close
  useEffect(() => {
    if (!view) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [view, close]);

  // Prevent body scroll when overlay is open
  useEffect(() => {
    if (!view) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [view]);

  // Nothing to render if closed
  if (!view || !isMounted) return null;

  if (view === 'commands') {
    return (
      <CommandModal
        open
        intent={commandIntent ?? null}
        onClose={onCommandClose ?? close}
      />
    );
  }

  const title = view === 'branding' ? 'Branding Studio' : 'AI Persona Settings';

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={close}
        aria-hidden="true"
      />

      {/* Modal Container */}
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-white/10 bg-slate-950/95 shadow-[0_0_50px_rgba(0,229,255,0.15)]">
        {/* Close Button */}
        <div className="sticky top-0 z-10 flex justify-between items-center p-3 bg-slate-950/80 backdrop-blur-md border-b border-white/5">
          <span className="text-white/90 text-sm font-semibold">{title}</span>
          <button
            onClick={close}
            className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-slate-900/50 border border-white/10 text-zinc-400 hover:text-white hover:border-cyan-500/30 transition-all"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          {view === 'branding' && <BrandingStudio />}
          {view === 'persona' && <AIPersonaSettings />}
        </div>
      </div>
    </div>,
    document.body
  );
});

export default OverlayController;