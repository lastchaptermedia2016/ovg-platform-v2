'use client';

import { useTelemetry } from '@/hooks/useTelemetry';

interface TelemetryGridProps {
  tenantId: string;
}

export default function TelemetryGrid({ tenantId }: TelemetryGridProps) {
  const { metrics, isLoading, error } = useTelemetry(tenantId);

  if (isLoading) {
    return (
      <div className="w-full rounded-2xl border border-white/10 bg-slate-950/15 backdrop-blur-md p-5 md:p-6 text-xs text-zinc-400 font-agrandir">
        Loading telemetry…
      </div>
    );
  }

  if (error !== null) {
    return (
      <div className="w-full rounded-2xl border border-red-500/30 bg-red-500/5 backdrop-blur-md p-5 md:p-6 text-xs text-red-400 font-agrandir">
        {error}
      </div>
    );
  }

  if (metrics.totalCalls === 0) {
    return (
      <div className="w-full rounded-2xl border border-white/10 bg-slate-950/15 backdrop-blur-md p-5 md:p-6 text-xs text-zinc-400 font-agrandir">
        No data captured
      </div>
    );
  }

  const cards = [
    {
      label: 'Total Interactions',
      value: metrics.totalCalls.toLocaleString(),
      accent: 'text-cyan-400',
    },
    {
      label: 'Avg. Response Time',
      value: `${metrics.avgResponse.toFixed(1)}ms`,
      accent: 'text-emerald-400',
    },
    {
      label: 'Success Rate',
      value: `${metrics.successRate.toFixed(1)}%`,
      accent: 'text-violet-400',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4 w-full">
      {cards.map((metric) => (
        <div
          key={metric.label}
          className="w-full rounded-2xl border border-white/10 bg-slate-950/15 backdrop-blur-md p-4 md:p-5"
        >
          <p className="text-[9px] font-bold tracking-widest text-slate-500 uppercase font-agrandir mb-1">
            {metric.label}
          </p>
          <p className={`font-agrandir text-lg md:text-xl font-black tracking-tight ${metric.accent}`}>
            {metric.value}
          </p>
        </div>
      ))}
    </div>
  );
}
