'use client';

import { useStudioDraft, isImageMode } from '@/contexts/StudioDraftContext';

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
        </div>
      </div>
      <p className="text-[10px] text-zinc-500 text-center mt-4 font-agrandir">
        Preview updates as you configure branding and persona
      </p>
    </div>
  );
}
