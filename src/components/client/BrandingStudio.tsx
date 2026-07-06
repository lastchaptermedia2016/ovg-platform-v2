'use client';

import { useState, useCallback, useEffect } from 'react';
import { createClient as createSupabaseClient } from '@/lib/supabase/client';
import { resolveTenantId } from '@/lib/resolveTenantId';
import { useStudioDraft, isImageMode, toCanonicalBranding } from '@/contexts/StudioDraftContext';
import type { CanonicalBranding } from '@/lib/schemas/tenant-config.canonical';

interface BrandingConfig {
  primaryColor: string;
  logoUrl: string;
  widgetPosition: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
}

interface BrandingStudioProps {
  onSave?: (config: BrandingConfig) => void;
}

interface Feedback {
  type: 'success' | 'error';
  message: string;
}

export type BackgroundConfig = {
  type: 'none' | 'solid' | 'image';
  image?: string;
  colorStart?: string;
};

export type StudioDraft = {
  primaryColor: string;
  logoUrl: string;
  widgetPosition: string;
  header: BackgroundConfig;
  footer: BackgroundConfig;
};

const defaultBackground: BackgroundConfig = {
  type: 'none',
};

export function BrandingStudio({ onSave }: BrandingStudioProps) {
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [tenantIdError, setTenantIdError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createSupabaseClient();
    supabase.auth.getSession().then(async ({ data }) => {
      const session = data.session;
      if (session?.user) {
        const { data: tenantIdResult, error } = await resolveTenantId(session.user.id);
        if (error) {
          setTenantIdError(error.message);
          console.error('[BrandingStudio] Failed to resolve tenantId:', error.message);
        } else {
          setTenantId(tenantIdResult);
          console.log('[BrandingStudio] Resolved tenantId:', tenantIdResult);
        }
      }
    });
  }, []);

  const { draft: draftConfig, setDraft: setDraftConfig } = useStudioDraft();

  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const isValidHexColor = (color: string): boolean => {
    return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{8})$/.test(color);
  };

  const isValidUrl = (url: string): boolean => {
    if (!url) return true;
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };

  const updateBackground = (
    key: 'header' | 'footer',
    patch: Partial<BackgroundConfig> | undefined
  ) => {
    setDraftConfig((prev) => ({
      ...prev,
      [key]: patch
        ? {
            type: patch.type ?? prev[key].type,
            image: patch.image ?? prev[key].image,
            colorStart: patch.colorStart ?? prev[key].colorStart,
          }
        : defaultBackground,
    }));
  };

  const handleSave = useCallback(async () => {
    setIsLoading(true);
    setFeedback(null);

    if (!tenantId) {
      setFeedback({
        type: 'error',
        message: tenantIdError || 'Unable to resolve tenant ID. Please refresh the page.',
      });
      setIsLoading(false);
      return;
    }

    try {
      if (!isValidHexColor(draftConfig.primaryColor)) {
        throw new Error('Invalid primary color format. Use hex color (e.g., #FF0000)');
      }

      if (!isValidUrl(draftConfig.logoUrl)) {
        throw new Error('Invalid logo URL. Please enter a valid URL or leave empty');
      }

      if (isImageMode(draftConfig.header) && draftConfig.header.image && !isValidUrl(draftConfig.header.image)) {
        throw new Error('Invalid header background image URL');
      }

      if (isImageMode(draftConfig.footer) && draftConfig.footer.image && !isValidUrl(draftConfig.footer.image)) {
        throw new Error('Invalid footer background image URL');
      }

      const canonicalBranding: Partial<CanonicalBranding> = toCanonicalBranding(draftConfig);

      const studioConfig = {
        branding: canonicalBranding,
      };

      const response = await fetch('/api/client/update-studio-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          studioConfig,
        }),
      });

      if (!response.ok) {
        let errorMessage = `HTTP ${response.status}`;
        try {
          const errorData = await response.json();
          errorMessage = (errorData as Record<string, unknown>).error as string || errorMessage;
        } catch {
          // If response is not JSON, use HTTP status message
        }
        throw new Error(errorMessage);
      }

      const result = await response.json();
      console.log('[BrandingStudio] Save successful:', result);

      setFeedback({
        type: 'success',
        message: 'Configuration saved successfully!',
      });

      if (onSave) {
        onSave(draftConfig as BrandingConfig);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save configuration';
      console.error('[BrandingStudio] Save error:', message, error);
      setFeedback({
        type: 'error',
        message,
      });
    } finally {
      setIsLoading(false);
    }
  }, [draftConfig, tenantId, tenantIdError, onSave]);

  const clearFeedback = useCallback(() => {
    setFeedback(null);
  }, []);

  return (
    <div className="branding-studio w-full rounded-2xl border border-white/10 bg-slate-950/15 backdrop-blur-xl p-6">
      <h2 className="text-lg font-semibold text-white mb-6 font-agrandir">
        Branding Studio
      </h2>

      <div className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-2 font-agrandir">
            Primary Color
          </label>
          <div className="flex gap-3 items-center">
            <input
              type="color"
              value={draftConfig.primaryColor}
              onChange={(e) => {
                setDraftConfig({ ...draftConfig, primaryColor: e.target.value });
                clearFeedback();
              }}
              className="w-16 h-10 rounded-lg cursor-pointer border border-white/10 hover:border-cyan-500/50 transition-colors"
              aria-label="Primary color picker"
            />
            <input
              type="text"
              value={draftConfig.primaryColor}
              onChange={(e) => {
                setDraftConfig({ ...draftConfig, primaryColor: e.target.value });
                clearFeedback();
              }}
              placeholder="#1A73E8"
              className="flex-1 px-3 py-2 rounded-lg bg-slate-900 text-white border border-white/10 focus:border-cyan-500 outline-none transition-colors text-sm font-mono"
              aria-label="Primary color hex value"
            />
          </div>
          <p className="text-xs text-zinc-500 mt-1">Enter a hex color code (e.g., #FF0000)</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-2 font-agrandir">
            Logo URL
          </label>
          <input
            type="text"
            placeholder="https://example.com/logo.png"
            value={draftConfig.logoUrl}
            onChange={(e) => {
              setDraftConfig({ ...draftConfig, logoUrl: e.target.value });
              clearFeedback();
            }}
            className="w-full px-3 py-2 rounded-lg bg-slate-900 text-white border border-white/10 focus:border-cyan-500 outline-none transition-colors text-sm"
            aria-label="Logo URL"
          />
          <p className="text-xs text-zinc-500 mt-1">Optional: provide a direct URL to your logo image</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-xl border border-white/10 bg-slate-900/40 p-4">
            <p className="text-xs font-semibold text-white mb-3">Header Background</p>
            <div className="space-y-3">
              <select
                value={draftConfig.header.type}
                onChange={(e) => {
                  const value = e.target.value as BackgroundConfig['type'];
                  updateBackground('header', value === 'none' ? undefined : { type: value });
                  clearFeedback();
                }}
                className="w-full px-3 py-2 rounded-lg bg-slate-900 text-white border border-white/10 focus:border-cyan-500 outline-none transition-colors text-sm"
                aria-label="Header background type"
              >
                <option value="none">None</option>
                <option value="solid">Solid Color</option>
                <option value="image">Image URL</option>
              </select>

              {draftConfig.header.type !== 'none' && (
                <>
                  {isImageMode(draftConfig.header) ? (
                    <>
                      <label className="block text-sm font-medium text-zinc-300 mb-2 font-agrandir">
                        Background Image URL
                      </label>
                      <input
                        type="text"
                        placeholder="https://cdn.example.com/header-bg.jpg"
                        value={draftConfig.header.image ?? ''}
                        onChange={(e) => {
                          updateBackground('header', { image: e.target.value });
                          clearFeedback();
                        }}
                        className="w-full px-3 py-2 rounded-lg bg-slate-900 text-white border border-white/10 focus:border-cyan-500 outline-none transition-colors text-sm"
                        aria-label="Header background image URL"
                      />
                    </>
                  ) : (
                    <div className="flex gap-3 items-center">
                      <input
                        type="color"
                        value={draftConfig.header.colorStart ?? '#1A73E8'}
                        onChange={(e) => {
                          updateBackground('header', { colorStart: e.target.value });
                          clearFeedback();
                        }}
                        className="w-10 h-10 rounded-lg cursor-pointer border border-white/10"
                        aria-label="Header color picker"
                      />
                      <input
                        type="text"
                        value={draftConfig.header.colorStart ?? ''}
                        onChange={(e) => {
                          updateBackground('header', { colorStart: e.target.value });
                          clearFeedback();
                        }}
                        placeholder="#1A73E8"
                        className="flex-1 px-3 py-2 rounded-lg bg-slate-900 text-white border border-white/10 focus:border-cyan-500 outline-none transition-colors text-sm font-mono"
                        aria-label="Header color value"
                      />
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-slate-900/40 p-4">
            <p className="text-xs font-semibold text-white mb-3">Footer Background</p>
            <div className="space-y-3">
              <select
                value={draftConfig.footer.type}
                onChange={(e) => {
                  const value = e.target.value as BackgroundConfig['type'];
                  updateBackground('footer', value === 'none' ? undefined : { type: value });
                  clearFeedback();
                }}
                className="w-full px-3 py-2 rounded-lg bg-slate-900 text-white border border-white/10 focus:border-cyan-500 outline-none transition-colors text-sm"
                aria-label="Footer background type"
              >
                <option value="none">None</option>
                <option value="solid">Solid Color</option>
                <option value="image">Image URL</option>
              </select>

              {draftConfig.footer.type !== 'none' && (
                <>
                  {isImageMode(draftConfig.footer) ? (
                    <>
                      <label className="block text-sm font-medium text-zinc-300 mb-2 font-agrandir">
                        Background Image URL
                      </label>
                      <input
                        type="text"
                        placeholder="https://cdn.example.com/footer-bg.jpg"
                        value={draftConfig.footer.image ?? ''}
                        onChange={(e) => {
                          updateBackground('footer', { image: e.target.value });
                          clearFeedback();
                        }}
                        className="w-full px-3 py-2 rounded-lg bg-slate-900 text-white border border-white/10 focus:border-cyan-500 outline-none transition-colors text-sm"
                        aria-label="Footer background image URL"
                      />
                    </>
                  ) : (
                    <div className="flex gap-3 items-center">
                      <input
                        type="color"
                        value={draftConfig.footer.colorStart ?? '#1A73E8'}
                        onChange={(e) => {
                          updateBackground('footer', { colorStart: e.target.value });
                          clearFeedback();
                        }}
                        className="w-10 h-10 rounded-lg cursor-pointer border border-white/10"
                        aria-label="Footer color picker"
                      />
                      <input
                        type="text"
                        value={draftConfig.footer.colorStart ?? ''}
                        onChange={(e) => {
                          updateBackground('footer', { colorStart: e.target.value });
                          clearFeedback();
                        }}
                        placeholder="#1A73E8"
                        className="flex-1 px-3 py-2 rounded-lg bg-slate-900 text-white border border-white/10 focus:border-cyan-500 outline-none transition-colors text-sm font-mono"
                        aria-label="Footer color value"
                      />
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-2 font-agrandir">
            Widget Position
          </label>
          <select
            value={draftConfig.widgetPosition}
            onChange={(e) => {
              setDraftConfig({
                ...draftConfig,
                widgetPosition: e.target.value as BrandingConfig['widgetPosition'],
              });
              clearFeedback();
            }}
            className="w-full px-3 py-2 rounded-lg bg-slate-900 text-white border border-white/10 focus:border-cyan-500 outline-none transition-colors text-sm"
            aria-label="Widget position"
          >
            <option value="bottom-right">Bottom Right</option>
            <option value="bottom-left">Bottom Left</option>
            <option value="top-right">Top Right</option>
            <option value="top-left">Top Left</option>
          </select>
          <p className="text-xs text-zinc-500 mt-1">Choose where the widget appears on your pages</p>
        </div>
      </div>

      {feedback && (
        <div
          className={`mt-5 p-4 rounded-lg flex items-start gap-3 ${
            feedback.type === 'success'
              ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300'
              : 'bg-red-500/15 border border-red-500/30 text-red-300'
          }`}
          role="alert"
        >
          <span className="text-lg mt-0.5">
            {feedback.type === 'success' ? '✓' : '⚠'}
          </span>
          <div className="flex-1">
            <p className="text-sm">{feedback.message}</p>
          </div>
          <button
            onClick={clearFeedback}
            className="text-lg leading-none hover:opacity-70 transition-opacity"
            aria-label="Dismiss message"
          >
            ×
          </button>
        </div>
      )}

      <button
        onClick={handleSave}
        disabled={isLoading}
        className="mt-6 w-full py-2.5 rounded-lg bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white font-semibold text-sm transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-cyan-500/10 hover:shadow-cyan-500/20 font-agrandir"
        aria-busy={isLoading}
      >
        {isLoading ? 'Saving...' : 'Save Configuration'}
      </button>

      <p className="text-xs text-zinc-500 mt-3 text-center">
        Changes will be applied immediately across your widget
      </p>
    </div>
  );
}
