'use client';

import ClientAuthCard from '@/components/auth/ClientAuthCard';

export default function ClientAuthPage() {

  return (
    <div className="flex min-h-screen w-full items-center justify-center p-4">
      {/* Production Excellence: Fixed Branding Header */}
      <header className="fixed top-0 left-0 right-0 z-20 bg-black/40 backdrop-blur-md border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex justify-between items-center">
          {/* Left Branding: POWERED BY ZEEDER AI — hidden on mobile */}
          <div className="hidden sm:flex items-center gap-0.5 font-agrandir">
            <span className="text-zinc-400 text-[10px] tracking-widest font-light uppercase">
              POWERED BY ZEEDER
            </span>
            <span className="text-yellow-400 animate-pulse font-bold text-[10px] tracking-wider">
              AI
            </span>
          </div>

          {/* Right Branding: ZEEDER engage + CLIENT LOGIN */}
          <div className="flex items-center justify-between w-full sm:w-auto font-agrandir">
            <div className="flex items-center gap-1">
              <span className="text-zinc-200 font-medium tracking-wide text-[10px] uppercase">
                ZEEDER
              </span>
              <span className="text-cyan-400 font-bold text-[10px] animate-pulse lowercase">engage</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-px h-3 bg-white/20 hidden sm:block" />
              <span className="text-cyan-400 text-[10px] font-semibold tracking-widest uppercase whitespace-nowrap">
                CLIENT LOGIN
              </span>
            </div>
          </div>
        </div>
      </header>

      <div className="w-full max-w-md px-4 sm:px-6 relative z-10">
        <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl shadow-2xl overflow-hidden">
          {/* Client Auth Card */}
          <div className="p-8">
            <ClientAuthCard />
          </div>
        </div>
      </div>
    </div>
  );
}