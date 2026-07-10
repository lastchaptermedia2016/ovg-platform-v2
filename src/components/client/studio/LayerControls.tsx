'use client';

import {
  gradientValue,
  parseGradient,
  type LayerDraft,
  type LayerType,
} from '@/contexts/StudioDraftContext';
import { isValidHexColor } from '@/lib/colors';
import { AssetUploader } from './AssetUploader';
import { OpacitySlider } from './OpacitySlider';

interface LayerControlsProps {
  title: string;
  layer: LayerDraft;
  onChange: (layer: LayerDraft) => void;
  /** Show the backdrop blur toggle (used for the widget body layer). */
  allowBlur?: boolean;
}

const TYPE_OPTIONS: { value: LayerType; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'solid', label: 'Solid Color' },
  { value: 'gradient', label: 'Gradient' },
  { value: 'image', label: 'Image' },
];

/**
 * Editor for a single branding layer (Header / Footer / Widget Body). Renders a
 * type selector, conditional media/color inputs, an opacity slider, and an
 * optional backdrop-blur toggle. All changes are pushed up via onChange so the
 * parent draft — and therefore the live preview — updates immediately.
 */
export function LayerControls({ title, layer, onChange, allowBlur = false }: LayerControlsProps) {
  // Gradient color stops are derived from the stored CSS gradient string so the
  // preview and the inputs stay in sync without extra state/effects.
  const [gradStart, gradEnd] = parseGradient(layer.type === 'gradient' ? layer.value : null);

  const update = (patch: Partial<LayerDraft>) => onChange({ ...layer, ...patch });

  const handleTypeChange = (type: LayerType) => {
    if (type === 'none') {
      update({ type, value: null });
    } else if (type === 'solid') {
      update({ type, value: layer.value ?? '#1A73E8' });
    } else if (type === 'gradient') {
      const start = layer.type === 'gradient' ? gradStart : '#1A73E8';
      const end = layer.type === 'gradient' ? gradEnd : '#0A2540';
      update({ type, value: gradientValue(start, end) });
    } else {
      update({ type, value: layer.value ?? '' });
    }
  };

  const commitGradient = (start: string, end: string) => {
    update({ value: gradientValue(start, end) });
  };

  return (
    <div className="rounded-xl border border-white/10 bg-slate-900/40 p-4">
      <p className="text-xs font-semibold text-white mb-3">{title}</p>
      <div className="space-y-3">
        <select
          value={layer.type}
          onChange={(e) => handleTypeChange(e.target.value as LayerType)}
          className="w-full px-3 py-2 rounded-lg bg-slate-900 text-white border border-white/10 focus:border-cyan-500 outline-none transition-colors text-sm"
          aria-label={`${title} background type`}
        >
          {TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        {layer.type !== 'none' && (
          <>
            {layer.type === 'image' ? (
              <AssetUploader
                value={layer.value}
                onChange={(url) => update({ value: url })}
                label={`${title} Image URL`}
              />
            ) : layer.type === 'gradient' ? (
              <div className="flex gap-3 items-center">
                <input
                  type="color"
                  value={isValidHexColor(gradStart) ? gradStart : '#1A73E8'}
                  onChange={(e) => commitGradient(e.target.value, gradEnd)}
                  className="w-10 h-10 rounded-lg cursor-pointer border border-white/10"
                  aria-label={`${title} gradient start color`}
                />
                <input
                  type="color"
                  value={isValidHexColor(gradEnd) ? gradEnd : '#0A2540'}
                  onChange={(e) => commitGradient(gradStart, e.target.value)}
                  className="w-10 h-10 rounded-lg cursor-pointer border border-white/10"
                  aria-label={`${title} gradient end color`}
                />
                <span className="text-xs text-zinc-500">Gradient</span>
              </div>
            ) : (
              <div className="flex gap-3 items-center">
                <input
                  type="color"
                  value={layer.value && isValidHexColor(layer.value) ? layer.value : '#1A73E8'}
                  onChange={(e) => update({ value: e.target.value })}
                  className="w-10 h-10 rounded-lg cursor-pointer border border-white/10"
                  aria-label={`${title} color picker`}
                />
                <input
                  type="text"
                  value={layer.value ?? ''}
                  onChange={(e) => update({ value: e.target.value })}
                  placeholder="#1A73E8"
                  className="flex-1 px-3 py-2 rounded-lg bg-slate-900 text-white border border-white/10 focus:border-cyan-500 outline-none transition-colors text-sm font-mono"
                  aria-label={`${title} color value`}
                />
              </div>
            )}

            <OpacitySlider
              value={layer.opacity}
              onChange={(opacity) => update({ opacity })}
            />

            {allowBlur && (
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={layer.backdropBlur}
                  onChange={(e) => update({ backdropBlur: e.target.checked })}
                  className="accent-cyan-500"
                  aria-label={`${title} backdrop blur`}
                />
                <span className="text-sm text-zinc-300 font-agrandir">Backdrop Blur</span>
              </label>
            )}
          </>
        )}
      </div>
    </div>
  );
}
