'use client';

import { useState } from 'react';
import { updateTenantPolicy } from '@/lib/db/tenant-actions';
import { uploadBrandingAsset } from '@/lib/services/media';
import { Upload, X, Check } from 'lucide-react';

interface ClientPolicyManagerProps {
  tenantId: string;
  resellerId: string;
  initialData: {
    show_ovg_branding: boolean;
    pricing_tier_key: string | null;
    custom_assets: {
      header_url: string | null;
      footer_url: string | null;
    } | null;
  };
  onUpdate?: () => void;
}

const PRICING_TIERS = [
  { value: 'basic', label: 'Basic' },
  { value: 'pro', label: 'Pro' },
  { value: 'enterprise', label: 'Enterprise' },
];

export function ClientPolicyManager({
  tenantId,
  resellerId,
  initialData,
  onUpdate,
}: ClientPolicyManagerProps) {
  const [showOvgBranding, setShowOvgBranding] = useState(initialData.show_ovg_branding);
  const [pricingTier, setPricingTier] = useState(initialData.pricing_tier_key || 'basic');
  const [customAssets, setCustomAssets] = useState(initialData.custom_assets || { header_url: null, footer_url: null });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uploading, setUploading] = useState<'header' | 'footer' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setError(null);
    setSaving(true);
    setSaved(false);

    try {
      await updateTenantPolicy(tenantId, resellerId, {
        show_ovg_branding: showOvgBranding,
        pricing_tier_key: pricingTier,
        custom_assets: customAssets,
      });

      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      onUpdate?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save policy');
    } finally {
      setSaving(false);
    }
  };

  const handleAssetUpload = async (type: 'header' | 'footer', file: File) => {
    setError(null);
    setUploading(type);

    try {
      const url = await uploadBrandingAsset(tenantId, type, file);
      setCustomAssets({
        ...customAssets,
        [`${type}_url`]: url,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(null);
    }
  };

  const handleAssetRemove = (type: 'header' | 'footer') => {
    setCustomAssets({
      ...customAssets,
      [`${type}_url`]: null,
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-white mb-4">Client Policy Management</h3>
        <p className="text-sm text-white/70 mb-6">
          Configure branding, pricing tier, and custom assets for this client.
        </p>
      </div>

      {error && (
        <div className="p-3 bg-red-500/20 border border-red-500/30 rounded-lg text-sm text-red-300">
          {error}
        </div>
      )}

      {saved && (
        <div className="p-3 bg-green-500/20 border border-green-500/30 rounded-lg text-sm text-green-300 flex items-center gap-2">
          <Check className="w-4 h-4" />
          Changes saved successfully
        </div>
      )}

      {/* Branding Switch */}
      <div className="flex items-center justify-between p-4 bg-slate-950/40 border border-white/10 rounded-lg" style={{ backdropFilter: 'blur(12px)' }}>
        <div>
          <h4 className="font-medium text-white">Show OVG Branding</h4>
          <p className="text-sm text-white/70">Display OGV branding elements on this client's interface</p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className="text-xs text-white/50 italic"
            title="As per Reseller Manual: This toggle overrides global branding for this specific tenant."
          >
            Governance Note
          </span>
          <button
            onClick={() => setShowOvgBranding(!showOvgBranding)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              showOvgBranding ? 'bg-[#0097b2]' : 'bg-white/30'
            }`}
            title="As per Reseller Manual: This toggle overrides global branding for this specific tenant."
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                showOvgBranding ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Pricing Tier Selector */}
      <div>
        <label className="block text-sm font-medium text-white mb-2">
          Pricing Tier
        </label>
        <select
          value={pricingTier}
          onChange={(e) => setPricingTier(e.target.value)}
          className="w-full px-3 py-2 border border-white/10 rounded-lg bg-slate-950/40 text-white focus:outline-none focus:ring-2 focus:ring-[#0097b2] focus:border-transparent"
          style={{ backdropFilter: 'blur(12px)' }}
        >
          {PRICING_TIERS.map((tier) => (
            <option key={tier.value} value={tier.value}>
              {tier.label}
            </option>
          ))}
        </select>
      </div>

      {/* Custom Assets Override */}
      <div className="space-y-4">
        <h4 className="font-medium text-white">Custom Assets Override</h4>
        <p className="text-sm text-white/70">
          Upload client-specific branding assets to override reseller defaults.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(['header', 'footer'] as const).map((type) => (
            <div key={type} className="space-y-2">
              <label className="block text-sm font-medium text-white">
                {type === 'header' ? 'Header Image' : 'Footer Image'}
              </label>
              <div
                className="relative border-2 border-dashed border-white/10 rounded-lg p-4 hover:border-[#0097b2] transition-colors cursor-pointer bg-slate-950/40"
                onClick={() => {
                  const input = document.getElementById(`asset-${type}`) as HTMLInputElement;
                  input?.click();
                }}
                style={{
                  borderColor: uploading === type ? '#0097b2' : undefined,
                  backgroundColor: uploading === type ? '#0097b220' : undefined,
                  backdropFilter: 'blur(12px)',
                }}
              >
                <input
                  id={`asset-${type}`}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleAssetUpload(type, file);
                  }}
                />

                {customAssets[`${type}_url`] ? (
                  <div className="relative">
                    <img
                      src={customAssets[`${type}_url`]!}
                      alt={`${type} preview`}
                      className="w-full h-24 object-cover rounded"
                    />
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAssetRemove(type);
                      }}
                      className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center text-white/70 py-4">
                    {uploading === type ? (
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#0097b2]" />
                    ) : (
                      <>
                        <Upload className="w-6 h-6 mb-1" />
                        <p className="text-xs">Click to upload</p>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 bg-[#0097b2] text-white rounded-lg font-medium hover:bg-[#007a8f] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {saving ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
              Saving...
            </>
          ) : (
            'Save Changes'
          )}
        </button>
      </div>
    </div>
  );
}
