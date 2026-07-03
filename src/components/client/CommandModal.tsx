'use client';

import { useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { getCapabilities, getAllCapabilities, resolveContextPath, resolvePermissionLevel } from '@/lib/capability-registry';

type CommandIntent = 'list_capabilities' | 'view_status' | 'get_help' | 'show_analytics';

interface CommandModalProps {
  open: boolean;
  intent: CommandIntent | null;
  onClose: () => void;
  clientProfile?: { resellerSlug?: string } | null;
}


export function CommandModal({ open, intent, onClose, clientProfile }: CommandModalProps) {
  const contextPath = useMemo(() => resolveContextPath(), []);
  const permissionLevel = useMemo(() => resolvePermissionLevel(clientProfile), [clientProfile]);
  const isSystemWide = intent === 'list_capabilities';
  const contextualCapabilities = useMemo(() => {
    if (!intent) return [];
    if (isSystemWide) {
      return getAllCapabilities(permissionLevel);
    }
    return getCapabilities(contextPath, permissionLevel, intent, 'branding');
  }, [contextPath, permissionLevel, intent, isSystemWide]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const items = contextualCapabilities;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Command List">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div className="relative w-full max-w-md max-h-[80vh] overflow-y-auto rounded-2xl border border-white/10 bg-slate-950/95 shadow-[0_0_50px_rgba(0,229,255,0.15)]">
        <div className="sticky top-0 z-10 flex flex-col gap-1 p-3 bg-slate-950/80 backdrop-blur-md border-b border-white/5">
          <div className="flex justify-between items-center">
            <span className="text-white/90 text-sm font-semibold">Command List</span>
            <button onClick={onClose} className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-slate-900/50 border border-white/10 text-zinc-400 hover:text-white hover:border-cyan-500/30 transition-all" aria-label="Close">
              <X size={18} />
            </button>
          </div>
          {isSystemWide && (
            <span className="text-[10px] font-semibold uppercase tracking-widest text-cyan-400">System Capabilities</span>
          )}
        </div>

        <div className="p-4 space-y-2">
          {items.map((item, idx) => (
            <div key={idx} className="w-full rounded-xl border border-white/10 bg-slate-900/40 px-4 py-3">
              <p className="text-xs font-semibold text-white">{item.label}</p>
              <p className="text-[10px] text-zinc-400 mt-1">{item.description}</p>
            </div>
          ))}
          {!intent && (
            <p className="text-xs text-zinc-400">No active command context.</p>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}