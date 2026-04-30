'use client';

import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { UniversalCommandModal } from './modals/UniversalCommandModal';

interface AddClientActionProps {
  onClientAdded?: () => void;
}

export function AddClientAction({ onClientAdded }: AddClientActionProps) {
  const [showModal, setShowModal] = useState(false);

  const handleClientAdded = () => {
    setShowModal(false);
    onClientAdded?.();
  };

  return (
    <>
      {/* Desktop/Tablet: Full width bar - AI Universal Command */}
      <div
        onClick={() => setShowModal(true)}
        className="hidden sm:flex w-full p-4 mb-8 items-center justify-between cursor-pointer group backdrop-blur-md bg-white/5 border border-white/10 rounded-2xl transition-all duration-300 hover:border-[#00e5ff] hover:shadow-[0_0_25px_rgba(0,229,255,0.4)] overflow-hidden"
        title="Talk to Pierre"
      >
        <div className="flex items-center gap-4">
          <div className="w-1 h-8 bg-[#00e5ff] rounded-full group-hover:shadow-[0_0_15px_#00e5ff] transition-all duration-300" />
          <span className="text-sm font-light tracking-[0.2em] text-white uppercase group-hover:text-white group-hover:drop-shadow-[0_0_8px_rgba(255,255,255,0.5)] transition-all duration-300">
            OPEN UNIVERSAL COMMAND
          </span>
        </div>
        <div className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center group-hover:bg-[#00e5ff]/20 group-hover:border-[#00e5ff]/50 transition-all duration-300">
          <Sparkles className="w-4 h-4 text-white/60 group-hover:text-[#00e5ff] transition-colors" />
        </div>
      </div>

      {/* Mobile: Floating Action Button (FAB) - AI Universal Command */}
      <div
        onClick={() => setShowModal(true)}
        className="sm:hidden fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-[#00e5ff] border border-[#00e5ff]/50 flex items-center justify-center shadow-[0_0_30px_rgba(0,229,255,0.6)] hover:shadow-[0_0_40px_rgba(0,229,255,0.8)] animate-pulse active:scale-95 transition-all duration-200 cursor-pointer group"
        aria-label="Open Universal Command"
        title="Talk to Pierre"
      >
        <Sparkles className="w-6 h-6 text-white group-hover:scale-110 transition-transform duration-200" />
      </div>

      {showModal && <UniversalCommandModal onClose={handleClientAdded} />}
    </>
  );
}
