'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function ClientDashboardPage() {
  const router = useRouter();

  useEffect(() => {
    const verifyAuth = async () => {
      const supabase = createClient();
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        router.replace('/client-auth');
      }
    };
    verifyAuth();
  }, [router]);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-6 md:py-10 flex flex-col gap-4">
      {/* Page Heading */}
      <header className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-cyan-400 font-agrandir">
            Client Portal
          </p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-white font-agrandir">
            Welcome back
          </h1>
          <p className="mt-1 text-xs text-zinc-400 font-agrandir">
            Your ZEEDER AI workspace is ready.
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-slate-950/15 backdrop-blur-xl px-4 py-2.5 text-xs text-zinc-300 font-agrandir">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse mr-2" />
          Session active
        </div>
      </header>

      {/* Telemetry Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 w-full">
        {[
          { label: 'Active Agents', value: '4', accent: 'text-cyan-400' },
          { label: 'Total Calls', value: '1,247', accent: 'text-blue-400' },
          { label: 'Avg. Response', value: '1.2s', accent: 'text-emerald-400' },
          { label: 'Success Rate', value: '98.7%', accent: 'text-violet-400' },
        ].map((metric) => (
          <div
            key={metric.label}
            className="w-full rounded-2xl border border-white/10 bg-slate-950/15 backdrop-blur-md md:backdrop-blur-xl p-4 md:p-5"
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

      {/* Main Grid: Widget Status + Sync Widget */}
      <div className="flex flex-col md:grid md:grid-cols-3 gap-6 w-full">
        {/* Widget Live Status — Single Widget Overview */}
        <section className="md:col-span-2 w-full rounded-2xl border border-white/10 bg-slate-950/15 backdrop-blur-md md:backdrop-blur-xl p-5 md:p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-white font-agrandir">Widget Live Status</h2>
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          </div>
          <div className="space-y-2.5">
            {[
              {
                label: 'Active Prompt Context',
                value: 'Enterprise Knowledge Base v1.4',
                status: 'SYNCED',
                statusColor: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
              },
              {
                label: 'Real-Time Stream Layer',
                value: 'Secure Client WebSocket',
                status: 'CONNECTED',
                statusColor: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30 animate-pulse',
              },
              {
                label: 'Last Configuration Push',
                value: 'Just now',
                status: null,
                statusColor: '',
              },
            ].map((item) => (
              <div
                key={item.label}
                className="w-full flex items-center justify-between rounded-xl border border-white/10 bg-slate-950/30 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-[9px] font-bold tracking-widest text-slate-500 uppercase font-agrandir mb-0.5">
                    {item.label}
                  </p>
                  <p className="text-xs font-medium text-white font-agrandir truncate">
                    {item.value}
                  </p>
                </div>
                {item.status && (
                  <span className={`shrink-0 text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border ${item.statusColor}`}>
                    {item.status}
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Sync Control Widget — Engine Pipeline Status */}
        <section className="w-full rounded-2xl border border-white/10 bg-slate-950/15 backdrop-blur-md md:backdrop-blur-xl p-5 md:p-6 flex flex-col">
          <h2 className="text-sm font-medium text-white font-agrandir mb-4">Sync Control</h2>
          <div className="flex-1 space-y-4">
            {/* Widget Core Pipeline Status */}
            <div className="space-y-2.5">
              {[
                {
                  layer: 'Cognitive AI Brain',
                  subtext: 'ZEEDER Core Inference v2',
                },
                {
                  layer: 'Neural Audio Input',
                  subtext: 'High-Fidelity Voice Transcription',
                },
                {
                  layer: 'Dynamic Speech Output',
                  subtext: 'Ultra-Low Latency Voice Synthesis',
                },
              ].map((item) => (
                <div
                  key={item.layer}
                  className="w-full rounded-xl border border-white/10 bg-slate-950/30 px-4 py-3 flex items-center justify-between"
                >
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold text-white font-agrandir tracking-tight">
                      {item.layer}
                    </p>
                    <p className="text-[9px] text-zinc-500 font-agrandir mt-0.5">
                      {item.subtext}
                    </p>
                  </div>
                  <span className="shrink-0 text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border bg-cyan-500/20 text-cyan-400 border-cyan-500/30 animate-pulse">
                    Active
                  </span>
                </div>
              ))}
            </div>

            {/* Configuration */}
            <div className="w-full rounded-xl border border-white/10 bg-slate-950/30 p-4">
              <p className="text-[9px] font-bold tracking-widest text-slate-500 uppercase font-agrandir mb-2">
                Configuration
              </p>
              <div className="space-y-2">
                <label className="flex items-center justify-between">
                  <span className="text-[10px] text-zinc-400 font-agrandir">Auto-sync</span>
                  <div className="w-7 h-4 rounded-full bg-slate-800 relative cursor-pointer">
                    <div className="w-3 h-3 rounded-full bg-cyan-400 absolute top-0.5 right-0.5 shadow-sm shadow-cyan-500/50" />
                  </div>
                </label>
                <label className="flex items-center justify-between">
                  <span className="text-[10px] text-zinc-400 font-agrandir">Real-time updates</span>
                  <div className="w-7 h-4 rounded-full bg-slate-800 relative cursor-pointer">
                    <div className="w-3 h-3 rounded-full bg-cyan-400 absolute top-0.5 right-0.5 shadow-sm shadow-cyan-500/50" />
                  </div>
                </label>
              </div>
            </div>
            <button className="w-full py-2 rounded-lg bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white font-semibold text-[11px] md:text-xs shadow-lg shadow-cyan-500/10 hover:shadow-cyan-500/20 transition-all duration-300">
              Provision Changes
            </button>
          </div>
        </section>
      </div>

      {/* Integrations Quick-View */}
      <section className="w-full rounded-2xl border border-white/10 bg-slate-950/15 backdrop-blur-md md:backdrop-blur-xl p-5 md:p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-medium text-white font-agrandir">Integrations</h2>
          <span className="text-[9px] font-bold tracking-widest text-cyan-400 font-agrandir uppercase cursor-pointer hover:text-cyan-300 transition-colors">
            Configure
          </span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {['Webhook', 'Slack', 'Email', 'API'].map((integration) => (
            <div
              key={integration}
              className="w-full rounded-xl border border-white/10 bg-slate-950/30 p-3 flex items-center gap-2 cursor-pointer hover:border-cyan-500/30 transition-all"
            >
              <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-sm shadow-emerald-500/50" />
              <span className="text-[10px] text-zinc-300 font-agrandir">{integration}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}