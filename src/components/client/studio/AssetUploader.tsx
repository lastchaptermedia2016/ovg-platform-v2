'use client';

import { useRef, useState } from 'react';

interface AssetUploaderProps {
  value: string | null;
  onChange: (url: string) => void;
  label?: string;
}

/**
 * Image source picker for layered backgrounds. Accepts a direct URL or a local
 * file (read as a data URL so it persists in the draft without a backend upload
 * endpoint). Emits the resulting URL via onChange.
 */
export function AssetUploader({ value, onChange, label = 'Background Image URL' }: AssetUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file');
      return;
    }
    setError(null);
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') onChange(reader.result);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-zinc-300 mb-1 font-agrandir">
        {label}
      </label>
      <input
        type="text"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder="https://cdn.example.com/bg.jpg"
        className="w-full px-3 py-2 rounded-lg bg-slate-900 text-white border border-white/10 focus:border-cyan-500 outline-none transition-colors text-sm"
        aria-label={label}
      />
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="text-xs px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:border-cyan-500/50 text-zinc-200 transition-colors"
        >
          Upload image
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
        {value ? (
          <span className="text-xs text-emerald-400 truncate max-w-[8rem]">Image set</span>
        ) : null}
      </div>
      {error ? <p className="text-xs text-red-400">{error}</p> : null}
    </div>
  );
}
