'use client';

import Image from 'next/image';
import { Upload, X } from 'lucide-react';

interface UploadZoneProps {
  type: 'header' | 'footer';
  currentUrl: string | null;
  inputRef: React.RefObject<HTMLInputElement | null>;
  uploading: 'header' | 'footer' | null;
  onFileSelect: (type: 'header' | 'footer', file: File) => void;
  onRemove: (type: 'header' | 'footer') => void;
}

export function UploadZone({
  type,
  currentUrl,
  inputRef,
  uploading,
  onFileSelect,
  onRemove,
}: UploadZoneProps) {
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-white">
        {type === 'header' ? 'Header Image' : 'Footer Image'}
      </label>
      <div
        className="relative border-2 border-dashed border-white/10 rounded-lg p-6 hover:border-[#0097b2] transition-colors cursor-pointer bg-slate-950/40"
        onClick={() => inputRef.current?.click()}
        style={{
          borderColor: uploading === type ? '#0097b2' : undefined,
          backgroundColor: uploading === type ? '#0097b220' : undefined,
          backdropFilter: 'blur(12px)',
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFileSelect(type, file);
          }}
        />

        {currentUrl ? (
          <div className="relative">
            <Image
              src={currentUrl}
              alt={`${type} preview`}
              width={640}
              height={128}
              unoptimized
              className="w-full h-32 object-cover rounded"
            />
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRemove(type);
              }}
              className="absolute top-2 right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center text-white/70">
            {uploading === type ? (
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0097b2]" />
            ) : (
              <>
                <Upload className="w-8 h-8 mb-2" />
                <p className="text-sm">Click to upload</p>
                <p className="text-xs text-white/50">PNG, JPEG, WebP</p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
