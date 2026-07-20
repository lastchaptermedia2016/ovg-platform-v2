'use client';

import { useState } from 'react';
import { useStudioDraft } from '@/contexts/StudioDraftContext';
import type { LayerDraft, StudioDraft } from '@/contexts/StudioDraftContext';
import type { CanonicalBranding, LayerConfig } from '@/lib/schemas/tenant-config.canonical';
import ChatWidget from '@/components/widget/ChatWidget';

/**
 * Convert a single branding layer (header / footer / widget body) from the
 * in-memory StudioDraft shape into the CanonicalBranding LayerConfig that the
 * production widget's `branding` prop and `generateBrandingCSS` expect.
 */
function layerToConfig(layer: LayerDraft): LayerConfig {
  return {
    type: layer.type,
    value: layer.value,
    opacity: layer.opacity,
    backdropBlur: layer.backdropBlur,
  };
}

/**
 * Map the live StudioDraft into the CanonicalBranding object the real
 * production <ChatWidget /> consumes. Only layers that are actually set
 * (type !== 'none') are passed through so the widget falls back to its
 * defaults for untouched surfaces.
 */
function draftToBranding(draft: StudioDraft): CanonicalBranding {
  const branding: CanonicalBranding = {};

  if (draft.primaryColor) branding.primaryColor = draft.primaryColor;
  if (draft.logoUrl) branding.logoUrl = draft.logoUrl;
  if (draft.brandName) branding.brandName = draft.brandName;
  if (draft.widgetPosition) {
    branding.widgetPosition = draft.widgetPosition as CanonicalBranding['widgetPosition'];
  }

  if (draft.header.type !== 'none') branding.header = layerToConfig(draft.header);
  if (draft.footer.type !== 'none') branding.footer = layerToConfig(draft.footer);
  if (draft.widgetBody.type !== 'none') branding.widgetBody = layerToConfig(draft.widgetBody);

  return branding;
}

export function WidgetPreview() {
  const { draft } = useStudioDraft();

  const [viewport, setViewport] = useState<'desktop' | 'mobile'>('desktop');
  const isMobile = viewport === 'mobile';

  // Live branding the production widget renders — updates the instant setDraft runs.
  const branding = draftToBranding(draft);

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
          className={`overflow-hidden rounded-xl border border-white/10 transition-all duration-300 ${
            isMobile ? 'mx-auto w-full max-w-[380px]' : 'w-full max-w-sm'
          }`}
          style={isMobile ? { height: '70vh' } : { height: '100%' }}
        >
          {/* Real production widget, rendered directly inside the canvas. It
               reads the live draft via `branding` and stays contained + inert
               (no realtime channels, seeded sample conversation). Live, unsaved
               Studio overrides are surfaced via `liveDraft` so the test-drive
               voice/text chat answers with the current on-screen vibe/brand. */}
          <ChatWidget
            tenantId=""
            branding={branding}
            preview
            liveDraft={{
              brandName: draft.brandName,
              personaMode: draft.personaMode,
              systemPrompt: draft.systemPrompt,
            }}
            greeting={draft.greeting}
            suggestedActions={draft.suggestedActions}
            features={draft.features}
          />
        </div>
      </div>

      <p className="text-[10px] text-zinc-500 text-center mt-4 font-agrandir">
        Preview updates live as you configure branding and persona
      </p>
    </div>
  );
}
