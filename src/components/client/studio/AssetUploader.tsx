'use client';

import { useRef, useState } from 'react';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

interface AssetUploaderProps {
  value: string | null;
  onChange: (url: string) => void;
  label?: string;
  onFileSelect?: (file: File) => Promise<void> | void;
  uploadLabel?: string;
}

interface SizeErrorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function SizeErrorModal({ isOpen, onClose }: SizeErrorModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-slate-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center gap-3 p-5 border-b border-white/10 bg-slate-950/50">
          <div className="w-10 h-10 rounded-full bg-red-500/20 border border-red-500/30 flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-white font-agrandir">File Size Limit Exceeded</h3>
        </div>
        <div className="p-5">
          <p className="text-zinc-300 text-sm leading-relaxed">
            The selected image is too large. Please upload an asset that is 10 MB or less.
          </p>
        </div>
        <div className="flex justify-end gap-3 p-5 border-t border-white/10 bg-slate-950/50">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-lg bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 text-sm font-medium uppercase tracking-wider hover:bg-cyan-500/30 transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
            autoFocus
          >
            Acknowledge
          </button>
        </div>
      </div>
    </div>
  );
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
  const [isSizeErrorModalOpen, setIsSizeErrorModalOpen] = useState(false);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file');
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setIsSizeErrorModalOpen(true);
      if (inputRef.current) inputRef.current.value = '';
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

  const closeSizeErrorModal = () => {
    setIsSizeErrorModalOpen(false);
  };

  return (
    <>
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

      <SizeErrorModal isOpen={isSizeErrorModalOpen} onClose={closeSizeErrorModal} />
    </>
  );
}
