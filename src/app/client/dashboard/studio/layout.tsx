'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { WidgetPreview } from '@/components/studio/WidgetPreview';
import { StudioDraftProvider } from '@/contexts/StudioDraftContext';

const navItems = [
  {
    href: '/client/dashboard/studio/branding',
    label: 'Branding',
    description: 'Colors, logo, and visual identity',
  },
  {
    href: '/client/dashboard/studio/persona',
    label: 'Persona',
    description: 'AI behavior, tone, and voice',
  },
];

export default function StudioLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <StudioDraftProvider>
    <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-6 md:py-10">
      <div className="mb-6">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-cyan-400 font-agrandir">
          Client Portal
        </p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight text-white font-agrandir">
          Studio
        </h1>
        <p className="mt-1 text-xs text-zinc-400 font-agrandir">
          Configure your widget branding and AI persona.
        </p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Navigation Sidebar */}
        <aside className="w-full lg:w-64 shrink-0">
          <nav className="rounded-2xl border border-white/10 bg-slate-950/15 backdrop-blur-xl p-3 space-y-1">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex flex-col rounded-xl px-4 py-3 transition-colors ${
                    isActive
                      ? 'bg-cyan-500/10 border border-cyan-500/30'
                      : 'border border-transparent hover:bg-white/5 hover:border-white/10'
                  }`}
                >
                  <span
                    className={`text-xs font-semibold font-agrandir ${
                      isActive ? 'text-cyan-400' : 'text-white'
                    }`}
                  >
                    {item.label}
                  </span>
                  <span className="text-[10px] text-zinc-500 font-agrandir mt-0.5">
                    {item.description}
                  </span>
                </Link>
              );
            })}
          </nav>
        </aside>

        {/* Split-pane container */}
        <div className="flex-1 flex flex-col lg:flex-row gap-6 min-w-0">
          {/* Main Content Area */}
          <main className="flex-1 min-w-0">
            {children}
          </main>

          {/* Preview Sidebar */}
          <aside className="w-full lg:w-80 xl:w-96 shrink-0">
            <WidgetPreview />
          </aside>
        </div>
      </div>
    </div>
    </StudioDraftProvider>
  );
}
