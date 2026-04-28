'use client';

export function SovereignPulse() {
  return (
    <div className="max-w-md w-full p-8 bg-white/[0.01] backdrop-blur-md border border-white/5 rounded-3xl flex flex-col gap-6 text-center">
      {/* Top Label */}
      <div className="text-[9px] tracking-[0.5em] text-white/30 uppercase">
        RESELLER METRICS
      </div>

      {/* Main Stat */}
      <div className="text-[#FFD700] font-black text-6xl animate-pulse-gold">
        88.4%
      </div>

      {/* Bottom Label */}
      <div className="text-[8px] tracking-[0.3em] text-white/50 uppercase">
        SYSTEM OPTIMIZATION BY PIERRE
      </div>
    </div>
  );
}
