'use client';

import { useStudioDraft, isImageMode } from '@/contexts/StudioDraftContext';

/**
 * Persona presets consumed by the live preview. Mirrors the canonical
 * ClientAIPersonaSchema / StudioDraft personaMode contract so the preview
 * understands 'sales' | 'concierge' without a separate refresh path. The
 * system-prompt template text is surfaced read-only (the authoritative copy
 * lives in persona/page.tsx); here it drives the visual personality indicator.
 */
const PERSONA_PRESETS: Record<
  'sales' | 'concierge',
  { label: string; trait: string; accent: string; prompt: string }
> = {
  sales: {
    label: 'Sales',
    trait: 'Lead qualification & conversion',
    accent: '#f59e0b',
    prompt:
      "You are a sales-focused AI assistant. Your primary goal is to qualify leads, understand customer needs, and guide them toward a purchase decision.",
  },
  concierge: {
    label: 'Concierge',
    trait: 'Premium hospitality & assistance',
    accent: '#22d3ee',
    prompt:
      'You are a concierge-style AI assistant. Your primary goal is to provide exceptional hospitality and personalized service.',
  },
};

export function WidgetPreview() {
  const { draft } = useStudioDraft();

  const headerBackgroundImage = isImageMode(draft.header) && draft.header.image ? draft.header.image : undefined;
  const footerBackgroundImage = isImageMode(draft.footer) && draft.footer.image ? draft.footer.image : undefined;

  const previewStyle: Record<string, string> = {};
  if (headerBackgroundImage) {
    previewStyle.backgroundImage = `url(${headerBackgroundImage})`;
    previewStyle.backgroundSize = 'cover';
    previewStyle.backgroundPosition = 'center';
  }
  if (footerBackgroundImage) {
    previewStyle.backgroundImage = `url(${footerBackgroundImage})`;
    previewStyle.backgroundSize = 'cover';
    previewStyle.backgroundPosition = 'center';
  }

  // Persona is a live observer of the draft — swaps the instant setDraft runs.
  const persona = PERSONA_PRESETS[draft.personaMode];
  const personaAccent = persona.accent;

  return (
    <div className="w-full h-full rounded-2xl border border-white/10 bg-slate-950/15 backdrop-blur-xl p-5 md:p-6 flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-white font-agrandir">Widget Preview</h3>
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
      </div>
      <div
        className="flex-1 flex items-center justify-center rounded-xl border border-white/10 bg-slate-950/30 p-4 transition-all duration-300"
        style={Object.keys(previewStyle).length > 0 ? previewStyle : undefined}
      >
        <div className={`w-full max-w-sm p-4 ${headerBackgroundImage || footerBackgroundImage ? 'bg-black/40' : ''}`}>
          <div className="flex items-center gap-2 mb-3">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center border"
              style={{
                backgroundColor: draft.primaryColor ? `${draft.primaryColor}20` : undefined,
                borderColor: draft.primaryColor ? `${draft.primaryColor}40` : undefined,
              }}
            >
              <span
                className="text-xs font-bold"
                style={{ color: draft.primaryColor || '#22d3ee' }}
              >
                Z
              </span>
            </div>
            <div>
              <p className="text-xs font-medium text-white">ZEEDER AI</p>
              <p className="text-[9px] text-zinc-500">Online</p>
            </div>
            {/* Live persona indicator — reacts to draft.personaMode immediately. */}
            <span
              className="ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-semibold"
              style={{ backgroundColor: `${personaAccent}1f`, color: personaAccent }}
              aria-label={`Persona mode: ${persona.label}`}
            >
              <span
                className="inline-block w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: personaAccent }}
              />
              {persona.label}
            </span>
          </div>
          <div className="space-y-2">
            <div className="h-2 bg-white/5 rounded w-full" />
            <div className="h-2 bg-white/5 rounded w-4/5" />
            <div className="h-2 bg-white/5 rounded w-3/5" />
          </div>
          <div className="mt-4 flex gap-2">
            <div
              className="h-8 flex-1 rounded-lg border"
              style={{
                backgroundColor: draft.primaryColor ? `${draft.primaryColor}30` : undefined,
                borderColor: draft.primaryColor ? `${draft.primaryColor}50` : undefined,
              }}
            />
            <div className="h-8 flex-1 rounded-lg bg-white/5 border border-white/10" />
          </div>
          {/* Persona trait + system-prompt template reflection. */}
          <div className="mt-4 rounded-lg border border-white/10 bg-white/[0.03] p-2.5">
            <p className="text-[10px] font-semibold" style={{ color: personaAccent }}>
              {persona.trait}
            </p>
            <p className="mt-1 text-[9px] leading-relaxed text-zinc-400 line-clamp-3">
              {persona.prompt}
            </p>
          </div>
        </div>
      </div>
      <p className="text-[10px] text-zinc-500 text-center mt-4 font-agrandir">
        Preview updates live as you configure branding and persona
      </p>
    </div>
  );
}
