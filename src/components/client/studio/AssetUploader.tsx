'use client';

import { useRef, useState } from 'react';

interface AssetUploaderProps {
  value: string | null;
  onChange: (url: string) => void;
  label?: string;
  onFileSelect?: (file: File) => Promise<void> | void;
  uploadLabel?: string;
}

/**
 * Image source picker for layered backgrounds.
 *
 * - If onFileSelect is provided, selected files are uploaded via the parent's async handler
 *   and the resulting URL is applied through onChange.
 * - If onFileSelect is omitted, files are read as data URLs client-side (legacy fallback).
 */
export function AssetUploader({
  value,
  onChange,
  label = 'Background Image URL',
  onFileSelect,
  uploadLabel,
}: AssetUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file');
      return;
    }
    setError(null);
    setUploading(true);

    try {
      if (onFileSelect) {
        await onFileSelect(file);
      } else {
        const reader = new FileReader();
        const result = await new Promise<string | ArrayBuffer>((resolve, reject) => {
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(reader.error ?? new Error('File read failed'));
          reader.readAsDataURL(file);
        });
        if (typeof result === 'string') onChange(result);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      setError(message);
    } finally {
      setUploading(false);
    }
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
          disabled={uploading}
          className="text-xs px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:border-cyan-500/50 text-zinc-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {uploading ? 'Uploading…' : (uploadLabel ?? 'Upload image')}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            void handleFile(e.target.files?.[0]);
            if (inputRef.current) inputRef.current.value = '';
          }}
        />
        {value ? (
          <span className="text-xs text-emerald-400 truncate max-w-[8rem]">Image set</span>
        ) : null}
      </div>
      {error ? <p className="text-xs text-red-400">{error}</p> : null}
    </div>
  );
}
