'use client';

import { useEffect } from 'react';
import { type CommandCapability } from '@/core/ai/system-capabilities';

interface HannahCommandDeckProps {
  isOpen: boolean;
  onClose: () => void;
  commands: CommandCapability[];
}

export function HannahCommandDeck({ isOpen, onClose, commands }: HannahCommandDeckProps) {
  // Keyboard dismissal handler
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen || commands.length === 0) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative max-w-md w-full mx-4 rounded-xl bg-slate-900/80 backdrop-blur-xl border border-white/10 shadow-2xl shadow-black/50 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#00e5ff] animate-pulse shadow-[0_0_8px_rgba(0,229,255,0.6)]" />
            <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-[#00e5ff] drop-shadow-[0_0_6px_rgba(0,229,255,0.3)]">
              AVAILABLE COMMANDS
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-white/40 hover:text-white/80 transition-colors text-sm leading-none"
            aria-label="Close command deck"
          >
            ✕
          </button>
        </div>
        <div className="px-4 py-4 space-y-2">
          {commands.map((cmd, idx) => (
            <div
              key={cmd.key || idx}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-white/[0.03] border border-white/5 hover:bg-white/[0.06] hover:border-white/10 transition-all duration-200 group"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[#0097b2]/60 group-hover:bg-[#00e5ff] transition-colors duration-200 flex-shrink-0" />
              <span className="text-[11px] font-medium text-white/80 group-hover:text-white tracking-wide">
                {cmd.name}
              </span>
              <span className="ml-auto text-[7px] text-white/20 tracking-wider uppercase flex-shrink-0">
                VOICE
              </span>
            </div>
          ))}
        </div>
        <div className="px-5 py-3 border-t border-white/5 flex items-center justify-between">
          <span className="text-[8px] text-white/30 tracking-wider">
            Click outside or press Esc to dismiss
          </span>
          <span className="text-[8px] text-[#0097b2]/60 tracking-wider font-medium">
            {commands.length} command{commands.length !== 1 ? 's' : ''} available
          </span>
        </div>
      </div>
    </div>
  );
}