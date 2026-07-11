'use client';

interface OpacitySliderProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
}

/**
 * Clamped opacity control for a branding layer. Range is 0–1.0 to align with
 * the canonical LayerConfig schema and allow zero-opacity states from the
 * voice/theme pipeline. The UI slider itself still defaults to a 0.1 floor so
 * manual drag interactions remain usable.
 */
export function OpacitySlider({
  value,
  onChange,
  min = 0.1,
  max = 1,
  step = 0.05,
}: OpacitySliderProps) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-zinc-300 font-agrandir">
          Opacity
        </label>
        <span className="text-xs text-zinc-400">{Math.round(value * 100)}%</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-cyan-500"
        aria-label="Layer opacity"
      />
    </div>
  );
}
