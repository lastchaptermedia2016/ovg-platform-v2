'use client';

import type { CSSProperties } from 'react';
import { useMemo, useState } from 'react';
import { useStudioDraft } from '@/contexts/StudioDraftContext';
import type { LayerDraft } from '@/contexts/StudioDraftContext';

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

/**
 * Translate a branding layer into inline CSS for the preview. Drives the
 * real-time preview — the widget reacts the instant setDraft runs because it
 * reads the live StudioDraft via useStudioDraft().
 */
function layerStyle(layer: LayerDraft | undefined, blur: string): CSSProperties {
  const style: CSSProperties = {};
  if (!layer || layer.type === 'none') return style;

  if (layer.type === 'image' && layer.value) {
    style.backgroundImage = `url(${layer.value})`;
    style.backgroundSize = 'cover';
    style.backgroundPosition = 'center';
  } else if (layer.value) {
    style.background = layer.value;
  }

  style.opacity = layer.opacity;

  if (layer.backdropBlur) {
    style.backdropFilter = blur;
    style.WebkitBackdropFilter = blur;
  }

  return style;
}

export function WidgetPreview() {
  const { draft } = useStudioDraft();

  const [viewport, setViewport] = useState<'desktop' | 'mobile'>('desktop');

  const effectiveBlur = useMemo(
    () => (viewport === 'mobile' ? 'blur(4px)' : 'blur(10px)'),
    [viewport],
  );

  // Persona is a live observer of the draft — swaps the instant setDraft runs.
  const persona = PERSONA_PRESETS[draft.personaMode];
  const personaAccent = persona.accent;

  const headerStyle = layerStyle(draft.header, effectiveBlur);
  const footerStyle = layerStyle(draft.footer, effectiveBlur);
  const bodyStyle = layerStyle(draft.widgetBody, effectiveBlur);

  const isMobile = viewport === 'mobile';

  return (
    <div className="w-full h-full rounded-2xl border border-white/10 bg-slate-950/15 backdrop-blur-xl p-5 md:p-6 flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-white font-agrandir">Widget Preview</h3>
        <div className="flex items-center gap-2">
          <div
            role="group"
            aria-label="Viewport breakpoint"
            className="flex items-center rounded-lg border border-white/10 bg-slate-950/40 p-0.5"
          >
            <button
              type="button"
              onClick={() => setViewport('desktop')}
              aria-pressed={!isMobile}
              className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium transition-colors ${
                !isMobile ? 'bg-white/10 text-white' : 'text-zinc-400 hover:text-white'
              }`}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="2" y="3" width="20" height="14" rx="2" />
                <path d="M8 21h8M12 17v4" />
              </svg>
              Desktop
            </button>
            <button
              type="button"
              onClick={() => setViewport('mobile')}
              aria-pressed={isMobile}
              className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium transition-colors ${
                isMobile ? 'bg-white/10 text-white' : 'text-zinc-400 hover:text-white'
              }`}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="6" y="2" width="12" height="20" rx="2" />
                <path d="M12 18h.01" />
              </svg>
              Mobile
            </button>
          </div>
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center rounded-xl border border-white/10 bg-slate-950/30 p-4 transition-all duration-300">
        <div
          className={`rounded-xl overflow-hidden border border-white/10 flex flex-col transition-all duration-300 ${
            isMobile ? 'mx-auto' : 'w-full max-w-sm'
          }`}
          style={
            isMobile
              ? { width: '90vw', maxWidth: 380, height: '70vh', margin: '0 auto' }
              : { width: 400, padding: '1rem' }
          }
        >
          {/* Header layer */}
          <div
            className="px-4 py-3 flex items-center gap-2 flex-shrink-0 transition-all duration-300"
            style={Object.keys(headerStyle).length > 0 ? headerStyle : undefined}
          >
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center border"
              style={{
                backgroundColor: draft.primaryColor ? `${draft.primaryColor}20` : undefined,
                borderColor: draft.primaryColor ? `${draft.primaryColor}40` : undefined,
              }}
            >
              <span className="text-xs font-bold" style={{ color: draft.primaryColor || '#22d3ee' }}>
                Z
              </span>
            </div>
            <div>
              <p className="text-xs font-medium text-white">ZEEDER AI</p>
              <p className="text-[9px] text-zinc-500">Online</p>
            </div>
            <span
              className="ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-semibold"
              style={{ backgroundColor: `${personaAccent}1f`, color: personaAccent }}
              aria-label={`Persona mode: ${persona.label}`}
            >
              <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ backgroundColor: personaAccent }} />
              {persona.label}
            </span>
          </div>

          {/* Widget body layer (transparency + media reflect here) */}
          <div
            className="p-4 flex-1 min-h-0 flex flex-col transition-all duration-300"
            style={Object.keys(bodyStyle).length > 0 ? bodyStyle : undefined}
          >
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
            <div className="mt-4 rounded-lg border border-white/10 bg-white/[0.03] p-2.5">
              <p className="text-[10px] font-semibold" style={{ color: personaAccent }}>
                {persona.trait}
              </p>
              <p className="mt-1 text-[9px] leading-relaxed text-zinc-400 line-clamp-3">
                {persona.prompt}
              </p>
            </div>
          </div>

          {/* Footer layer */}
          <div
            className="px-4 py-3 flex-shrink-0 transition-all duration-300"
            style={Object.keys(footerStyle).length > 0 ? footerStyle : undefined}
          >
            <p className="text-[9px] text-zinc-400">Powered by Zeeder AI</p>
          </div>
        </div>
      </div>
      <p className="text-[10px] text-zinc-500 text-center mt-4 font-agrandir">
        Preview updates live as you configure branding and persona
      </p>
    </div>
  );
}
