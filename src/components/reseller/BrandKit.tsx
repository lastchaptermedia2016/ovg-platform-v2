'use client';

import { useState, useRef } from 'react';
import { uploadBrandingAsset } from '@/lib/services/media';
import { useBrandKit } from '@/contexts/BrandKitContext';
import { Upload, X, Fingerprint } from 'lucide-react';

interface UploadZoneProps {
  type: 'header' | 'footer';
  currentUrl: string | null;
  inputRef: React.RefObject<HTMLInputElement | null>;
  uploading: 'header' | 'footer' | null;
  onFileSelect: (type: 'header' | 'footer', file: File) => void;
  onRemove: (type: 'header' | 'footer') => void;
}

interface BrandKitProps {
  resellerId: string;
  onUpdate?: (headerUrl: string | null, footerUrl: string | null) => void;
}

const UploadZone = ({
  type,
  currentUrl,
  inputRef,
  uploading,
  onFileSelect,
  onRemove,
}: UploadZoneProps) => (
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
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={currentUrl}
            alt={`${type} preview`}
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

export function BrandKit({
  resellerId,
  onUpdate,
}: BrandKitProps) {
  const { headerUrl, setHeaderUrl, footerUrl, setFooterUrl } = useBrandKit();
  const [uploading, setUploading] = useState<'header' | 'footer' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const headerInputRef = useRef<HTMLInputElement>(null);
  const footerInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (
    type: 'header' | 'footer',
    file: File
  ) => {
    setError(null);
    setUploading(type);

    try {
      const url = await uploadBrandingAsset(resellerId, type, file);

      if (type === 'header') {
        setHeaderUrl(url);
      } else {
        setFooterUrl(url);
      }

      onUpdate?.(headerUrl, footerUrl);
    } catch (_err) {
      setError(_err instanceof Error ? _err.message : 'Upload failed');
    } finally {
      setUploading(null);
    }
  };

  const handleRemove = async (type: 'header' | 'footer') => {
    setError(null);

    try {
      if (type === 'header') {
        setHeaderUrl(null);
      } else {
        setFooterUrl(null);
      }

      onUpdate?.(headerUrl, footerUrl);
    } catch (_err) {
      setError(_err instanceof Error ? _err.message : 'Remove failed');
    }
  };

  return (
    <div className="space-y-6 pt-8">
      <div className="flex items-start gap-3">
        <Fingerprint className="w-5 h-5 text-[#0097b2] mt-0.5" />
        <div>
          <h3 className="text-lg font-semibold text-white mb-1">Identity & Assets</h3>
          <p className="text-sm text-white/70">
            Upload your custom header and footer images to personalize your reseller dashboard.
          </p>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-500/20 border border-red-500/30 rounded-lg text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <UploadZone
          type="header"
          currentUrl={headerUrl}
          inputRef={headerInputRef}
          uploading={uploading}
          onFileSelect={handleFileSelect}
          onRemove={handleRemove}
        />
        <UploadZone
          type="footer"
          currentUrl={footerUrl}
          inputRef={footerInputRef}
          uploading={uploading}
          onFileSelect={handleFileSelect}
          onRemove={handleRemove}
        />
      </div>
    </div>
  );
}