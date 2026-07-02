'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

type CommandIntent = 'list_capabilities' | 'view_status' | 'get_help' | 'show_analytics';

interface CommandModalProps {
  open: boolean;
  intent: CommandIntent | null;
  onClose: () => void;
}

const COMMANDS: Record<CommandIntent, Array<{ label: string; description: string }>> = {
  list_capabilities: [
    { label: 'View analytics', description: 'Show latest tenant performance metrics' },
    { label: 'Update configuration', description: 'Modify branding and persona settings' },
    { label: 'Check status', description: 'Display active pipeline health' },
  ],
  view_status: [
    { label: 'System health', description: 'Cognitive AI Brain, Neural Audio, Speech Output' },
    { label: 'Active integrations', description: 'Webhook, Slack, Email, API' },
  ],
  get_help: [
    { label: 'Commands', description: 'List available voice commands' },
    { label: 'Permissions', description: 'Show what the AI can execute' },
  ],
  show_analytics: [
    { label: 'Success rate', description: '98.7%' },
    { label: 'Avg response', description: '1.2s' },
  ],
};

export function CommandModal({ open, intent, onClose }: CommandModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const items = intent ? COMMANDS[intent] : [];

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Command List">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div className="relative w-full max-w-md max-h-[80vh] overflow-y-auto rounded-2xl border border-white/10 bg-slate-950/95 shadow-[0_0_50px_rgba(0,229,255,0.15)]">
        <div className="sticky top-0 z-10 flex justify-between items-center p-3 bg-slate-950/80 backdrop-blur-md border-b border-white/5">
          <span className="text-white/90 text-sm font-semibold">Command List</span>
          <button onClick={onClose} className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-slate-900/50 border border-white/10 text-zinc-400 hover:text-white hover:border-cyan-500/30 transition-all" aria-label="Close">
            <X size={18} />
          </button>
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