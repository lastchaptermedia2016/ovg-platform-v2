'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

interface BackButtonProps {
  href?: string;
  label?: string;
}

/**
 * Client-side navigation back to the dashboard. Uses the app-router
 * useRouter (not an <a> tag) to avoid full page reloads / state resets.
 */
export function BackButton({
  href = '/client/dashboard',
  label = 'Back to Dashboard',
}: BackButtonProps) {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => router.push(href)}
      aria-label={label}
      className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-slate-950/40 px-3 py-1.5 text-[11px] font-semibold text-zinc-300 backdrop-blur-md transition-colors hover:border-cyan-500/40 hover:text-cyan-300 font-agrandir"
    >
      <ArrowLeft className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}
