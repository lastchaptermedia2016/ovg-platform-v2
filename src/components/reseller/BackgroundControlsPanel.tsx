'use client';

interface BackgroundControlsPanelProps {
  title: string;
  type: 'solid' | 'gradient' | 'image';
  onTypeChange: (type: 'solid' | 'gradient' | 'image') => void;
  solidColor: string;
  onSolidColorChange: (color: string) => void;
  gradientStart: string;
  onGradientStartChange: (color: string) => void;
  gradientEnd: string;
  onGradientEndChange: (color: string) => void;
  imageUrl: string;
  onImageUrlChange: (url: string) => void;
  uploadLabel?: string;
  imagePlaceholder?: string;
  opacity: number;
  onOpacityChange: (value: number) => void;
  opacityLabel?: string;
  solidPlaceholder?: string;
}

import { toHex } from '@/lib/branding/gradient';

export function BackgroundControlsPanel({
  title,
  type,
  onTypeChange,
  solidColor,
  onSolidColorChange,
  gradientStart,
  onGradientStartChange,
  gradientEnd,
  onGradientEndChange,
  imageUrl,
  onImageUrlChange,
  uploadLabel,
  imagePlaceholder,
  opacity,
  onOpacityChange,
  opacityLabel,
  solidPlaceholder,
}: BackgroundControlsPanelProps) {
  const typeButtonClass = (current: string) =>
    `px-3 py-1.5 text-xs rounded transition-all ${
      type === current
        ? 'bg-[#0097b2] text-white'
        : 'bg-white/10 text-white/60 hover:bg-white/20'
    }`;

  const colorInputClass =
    'w-9 h-9 rounded-lg border border-white/20 bg-transparent cursor-pointer shrink-0';

  const textInputClass =
    'flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white font-mono text-sm w-full focus:outline-none focus:border-white/30';

  return (
    <div className="space-y-4 mb-6">
      <h3 className="text-sm font-semibold text-white/80 uppercase tracking-wider">{title}</h3>
      <div className="flex gap-2 mb-3">
        <button onClick={() => onTypeChange('solid')} className={typeButtonClass('solid')}>Solid</button>
        <button onClick={() => onTypeChange('gradient')} className={typeButtonClass('gradient')}>Gradient</button>
        <button onClick={() => onTypeChange('image')} className={typeButtonClass('image')}>Image</button>
      </div>

      {type === 'solid' ? (
        <div className="flex items-center gap-3">
          <input
            type="color"
            className={colorInputClass}
            value={toHex(solidColor)}
            onChange={(e) => onSolidColorChange(e.target.value)}
          />
          <input
            type="text"
            value={solidColor}
            onChange={(e) => onSolidColorChange(e.target.value)}
            className={textInputClass}
            placeholder={solidPlaceholder ?? '#0097b2'}
          />
        </div>
      ) : type === 'gradient' ? (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <input
              type="color"
              className={colorInputClass}
              value={toHex(gradientStart)}
              onChange={(e) => onGradientStartChange(e.target.value)}
            />
            <input
              type="text"
              value={gradientStart}
              onChange={(e) => onGradientStartChange(e.target.value)}
              className={textInputClass}
              placeholder="Start color"
            />
          </div>
          <div className="flex items-center gap-3">
            <input
              type="color"
              className={colorInputClass}
              value={toHex(gradientEnd)}
              onChange={(e) => onGradientEndChange(e.target.value)}
            />
            <input
              type="text"
              value={gradientEnd}
              onChange={(e) => onGradientEndChange(e.target.value)}
              className={textInputClass}
              placeholder="End color"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs text-white/60 uppercase tracking-wider">{opacityLabel ?? 'Background Opacity'}</label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min="0"
                max="100"
                value={Math.round(opacity * 100)}
                onChange={(e) => onOpacityChange(parseInt(e.target.value) / 100)}
                className="flex-1 h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-[#0097b2]"
              />
              <span className="text-xs text-white/80 w-12 text-right">{Math.round(opacity * 100)}%</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={imageUrl}
              onChange={(e) => onImageUrlChange(e.target.value)}
              className="flex-1 bg-black/30 border border-white/20 rounded px-3 py-2 text-xs text-white focus:border-[#0097b2] outline-none"
              placeholder={imagePlaceholder ?? 'https://example.com/image.jpg'}
            />
            <button className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-xs rounded transition-all">
              {uploadLabel ?? 'Upload'}
            </button>
          </div>
          <div className="space-y-2">
            <label className="text-xs text-white/60 uppercase tracking-wider">{opacityLabel ?? 'Background Opacity'}</label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min="0"
                max="100"
                value={Math.round(opacity * 100)}
                onChange={(e) => onOpacityChange(parseInt(e.target.value) / 100)}
                className="flex-1 h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-[#0097b2]"
              />
              <span className="text-xs text-white/80 w-12 text-right">{Math.round(opacity * 100)}%</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
