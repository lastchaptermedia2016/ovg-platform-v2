'use client';

export function BrandingFooter() {
  return (
    <div className="w-full flex justify-center mb-10">
      <div className="inline-flex items-center justify-center px-6 py-2 rounded-full backdrop-blur-[2px] bg-white/[0.03] border border-white/10">
        <span className="text-[10px] font-bold tracking-[0.3em] text-white/40 uppercase animate-signature-pulse" style={{ textShadow: '0 2px 10px rgba(0,0,0,0.8)' }}>
          POWERED BY PIERRE
        </span>
        <div className="h-3 w-[1px] bg-white/20 mx-2" />
        <span className="text-[#FFD700] font-black text-lg animate-gold-pulse">
          AI
        </span>
      </div>
    </div>
  );
}
