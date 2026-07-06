'use client';

export default function PersonaPage() {
  return (
    <div className="w-full rounded-2xl border border-white/10 bg-slate-950/15 backdrop-blur-xl p-5 md:p-6">
      <h2 className="text-sm font-medium text-white font-agrandir mb-1">
        Persona Settings
      </h2>
      <p className="text-xs text-zinc-400 font-agrandir mb-4">
        Define AI behavior, tone, conversation style, and voice preferences.
      </p>

      <div className="rounded-xl border border-white/10 bg-slate-950/30 p-4">
        <p className="text-xs text-zinc-500 font-agrandir">
          Persona settings will be loaded here.
        </p>
      </div>
    </div>
  );
}
