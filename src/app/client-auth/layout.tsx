import React from 'react';

export default function ClientAuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen w-full bg-cover bg-center bg-no-repeat relative" style={{ backgroundImage: "url('/clientsbg.jpg')" }}>
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative z-10 font-agrandir">
        {children}
      </div>
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 font-agrandir">
        <div className="backdrop-blur-md bg-black/20 border border-white/5 whitespace-nowrap px-3 py-1 rounded-full">
          <span className="text-zinc-300 text-[8.5px] md:text-[9.5px] tracking-[0.18em] uppercase font-light">
            POWERED BY{' '}
          </span>
          <span className="text-white font-bold text-[8.5px] md:text-[9.5px]">
            ZEEDER{' '}
          </span>
          <span className="text-blue-500 text-[8.5px] md:text-[9.5px] lowercase animate-pulse">
            engage
          </span>
        </div>
      </div>
    </div>
  );
}