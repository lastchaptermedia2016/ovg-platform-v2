'use client';

export function MasterpieceHeader() {
  return (
    <nav className="w-full flex justify-between items-center px-6 py-5 backdrop-blur-md bg-white/[0.01] border border-white/5 rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.1)] pointer-events-none">
      {/* Left Side */}
      <div className="text-[9px] font-bold tracking-[0.6em] text-white/40 uppercase animate-signature-pulse pointer-events-auto">
        POWERED BY PIERRE
      </div>

      {/* Right Side */}
      <div className="flex items-center pointer-events-auto">
        <span className="text-[#FFD700] font-black text-xl animate-pulse-gold">
          AI
        </span>
        <div className="h-4 w-[1px] bg-white/20 mx-6" />
        <span className="text-white/90 font-light tracking-[0.4em] text-[10px] uppercase">
          RESELLER DASHBOARD
        </span>
      </div>
    </nav>
  );
}
