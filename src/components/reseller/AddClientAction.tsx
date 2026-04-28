'use client';

import { useState } from 'react';
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
      {/* Desktop/Tablet: Full width bar */}
      <div
        onClick={() => setShowModal(true)}
        className="hidden sm:flex w-full p-4 mb-8 items-center justify-between cursor-pointer group backdrop-blur-md bg-white/5 border border-white/10 rounded-2xl transition-all duration-300 hover:border-[#0097b2] hover:shadow-[0_0_20px_rgba(0,151,178,0.3)] overflow-hidden"
      >
        <div className="flex items-center gap-4">
          <div className="w-1 h-8 bg-[#0097b2] rounded-full group-hover:shadow-[0_0_10px_#0097b2] transition-all duration-300" />
          <span className="text-sm font-light tracking-[0.2em] text-white uppercase group-hover:text-white group-hover:drop-shadow-[0_0_8px_rgba(255,255,255,0.5)] transition-all duration-300">
            ADD NEW CLIENT
          </span>
        </div>
        <div className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center group-hover:bg-[#0097b2]/20 group-hover:border-[#0097b2]/50 transition-all duration-300">
          <span className="text-lg text-white/60 group-hover:text-[#0097b2] transition-colors">+</span>
        </div>
      </div>

      {/* Mobile: Floating Action Button (FAB) */}
      <div
        onClick={() => setShowModal(true)}
        className="sm:hidden fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-[#0097b2] border border-[#0097b2]/50 flex items-center justify-center shadow-[0_0_20px_rgba(0,151,178,0.5)] active:scale-95 transition-all duration-200"
        aria-label="Add New Client"
      >
        <span className="text-2xl text-white">+</span>
      </div>

      {showModal && <UniversalCommandModal onClose={handleClientAdded} />}
    </>
  );
}
