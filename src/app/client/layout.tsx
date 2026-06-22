import type { ReactNode } from 'react';

export default function ClientLayout({ children }: { children: ReactNode }) {
  return (
    <div className="font-agrandir antialiased text-white min-h-screen bg-transparent overflow-x-hidden flex flex-col">
      {/* Fixed Background Matrix — binary/code matrix bleed with deep dark preservation */}
      <div className="fixed top-0 left-0 w-[100vw] h-[100vh] z-[-10] bg-[url('/clientsbg.jpg')] bg-cover bg-center bg-no-repeat bg-fixed">
        <div className="absolute inset-0 bg-black/60" />
      </div>

      {/* Responsive Header Bar — layout-matched premium template */}
      <header className="w-full flex justify-between items-center px-4 py-3 whitespace-nowrap border-b border-slate-800/40 bg-black/30 backdrop-blur-xl">
        {/* Far-Left Branding: POWERED BY ZEEDER AI — hidden on mobile */}
        <div className="hidden sm:flex items-center gap-1.5 shrink-0">
          <span className="text-zinc-400 text-[9px] tracking-[0.18em] uppercase font-light">
            POWERED BY ZEEDER
          </span>
          <span className="text-[#FFD700] text-[9px] font-bold uppercase animate-pulse drop-shadow-[0_0_10px_rgba(255,215,0,0.4)]">
            AI
          </span>
        </div>

        {/* Right Side: unified horizontal container */}
        <div className="flex items-center justify-between w-full sm:w-auto gap-3 sm:gap-6">
          {/* ZEEDER engage block (left-aligned within container) */}
          <div className="flex items-center gap-1">
            <span className="text-zinc-300 text-[8.5px] md:text-[9.5px] tracking-[0.18em] uppercase font-light">
              ZEEDER
            </span>
            <span className="text-cyan-400 font-bold text-[8.5px] md:text-[9.5px] lowercase animate-pulse">
              engage
            </span>
          </div>

          {/* Navigation status (far-right) */}
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
            <span className="text-zinc-400 text-[8.5px] md:text-[9.5px] tracking-[0.18em] uppercase font-light">
              Dashboard
            </span>
          </div>
        </div>
      </header>

      {/* Page Content — flex-1 pushes footer to bottom */}
      <main className="flex-1 w-full">
        {children}
      </main>

      {/* Footer branding — sits naturally in flex flow below content */}
      <div className="flex justify-center pb-4">
        <div className="backdrop-blur-md bg-black/20 border border-white/5 whitespace-nowrap px-3 py-1 rounded-full">
          <span className="text-zinc-300 text-[8.5px] md:text-[9.5px] tracking-[0.18em] uppercase font-light">
            POWERED BY ZEEDER |{' '}
          </span>
          <span className="text-cyan-400 font-bold text-[8.5px] md:text-[9.5px] lowercase animate-pulse">
            engage
          </span>
        </div>
      </div>
    </div>
  );
}