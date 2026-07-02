'use client';

import { useState, useCallback } from 'react';

/**
 * Branding configuration interface
 * Defines the structure for studio-level customization settings
 */
interface BrandingConfig {
  primaryColor: string;
  logoUrl: string;
  widgetPosition: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
}

/**
 * Component props interface
 * Allows optional tenantId and callback on save
 */
interface BrandingStudioProps {
  tenantId?: string;
  onSave?: (config: BrandingConfig) => void;
}

/**
 * Feedback state interface
 * Tracks UI feedback messages
 */
interface Feedback {
  type: 'success' | 'error';
  message: string;
}

type BackgroundType = 'solid' | 'gradient';

interface BackgroundSectionConfig {
  type: BackgroundType;
  colorStart: string;
  colorEnd: string;
  image: string;
}

/**
 * BrandingStudio Component
 * Self-contained component for managing branding configurations
 * - Handles its own state and error management
 * - Does not import from reseller, master, or other isolated directories
 * - Uses Tailwind CSS for styling matching project design system
 * - Defensive error handling with console logging
 */
const defaultBackground: BackgroundSectionConfig = {
  type: 'solid',
  colorStart: '#1A73E8',
  colorEnd: '#34A853',
  image: '',
};

export function BrandingStudio({ tenantId = 'client-tenant-id', onSave }: BrandingStudioProps) {
  const [config, setConfig] = useState<BrandingConfig & { headerConfig?: BackgroundSectionConfig; footerConfig?: BackgroundSectionConfig }>({
    primaryColor: '#1A73E8',
    logoUrl: '',
    widgetPosition: 'bottom-right',
    headerConfig: undefined,
    footerConfig: undefined,
  });

  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  /**
   * Validates hex color format
   */
  const isValidHexColor = (color: string): boolean => {
    return /^#[0-9A-F]{6}$/i.test(color);
  };

  /**
   * Validates URL format
   */
  const isValidUrl = (url: string): boolean => {
    if (!url) return true; // URL is optional
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };

  const updateSection = (
    key: 'headerConfig' | 'footerConfig',
    patch: Partial<BackgroundSectionConfig> | undefined
  ) => {
    setConfig((prev) => ({
      ...prev,
      [key]: patch
        ? {
            type: patch.type ?? prev[key]?.type ?? defaultBackground.type,
            colorStart: patch.colorStart ?? prev[key]?.colorStart ?? defaultBackground.colorStart,
            colorEnd: patch.colorEnd ?? prev[key]?.colorEnd ?? defaultBackground.colorEnd,
            image: patch.image ?? prev[key]?.image ?? defaultBackground.image,
          }
        : undefined,
    }));
  };

  /**
   * Handles form submission and API call
   * Posts configuration to /api/client/update-studio-config
   */
  const handleSave = useCallback(async () => {
    setIsLoading(true);
    setFeedback(null);

    try {
      // Client-side validation
      if (!isValidHexColor(config.primaryColor)) {
        throw new Error('Invalid primary color format. Use hex color (e.g., #FF0000)');
      }

      if (!isValidUrl(config.logoUrl)) {
        throw new Error('Invalid logo URL. Please enter a valid URL or leave empty');
      }

      if (config.headerConfig) {
        if (!isValidHexColor(config.headerConfig.colorStart)) {
          throw new Error('Invalid header start color');
        }
        if (config.headerConfig.type === 'gradient' && !isValidHexColor(config.headerConfig.colorEnd)) {
          throw new Error('Invalid header end color');
        }
        if (config.headerConfig.image && !isValidUrl(config.headerConfig.image)) {
          throw new Error('Invalid header background image URL');
        }
      }

      if (config.footerConfig) {
        if (!isValidHexColor(config.footerConfig.colorStart)) {
          throw new Error('Invalid footer start color');
        }
        if (config.footerConfig.type === 'gradient' && !isValidHexColor(config.footerConfig.colorEnd)) {
          throw new Error('Invalid footer end color');
        }
        if (config.footerConfig.image && !isValidUrl(config.footerConfig.image)) {
          throw new Error('Invalid footer background image URL');
        }
      }

      const response = await fetch('/api/client/update-studio-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          studioConfig: config,
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

      // Call optional callback
      if (onSave) {
        onSave(config);
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
  }, [config, tenantId, onSave]);

  /**
   * Clears feedback message
   */
  const clearFeedback = useCallback(() => {
    setFeedback(null);
  }, []);

  return (
    <div className="branding-studio w-full rounded-2xl border border-white/10 bg-slate-950/15 backdrop-blur-xl p-6">
      <h2 className="text-lg font-semibold text-white mb-6 font-agrandir">
        Branding Studio
      </h2>

      {/* Form Inputs */}
      <div className="space-y-5">
        {/* Primary Color Input */}
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-2 font-agrandir">
            Primary Color
          </label>
          <div className="flex gap-3 items-center">
            <input
              type="color"
              value={config.primaryColor}
              onChange={(e) => {
                setConfig({ ...config, primaryColor: e.target.value });
                clearFeedback();
              }}
              className="w-16 h-10 rounded-lg cursor-pointer border border-white/10 hover:border-cyan-500/50 transition-colors"
              aria-label="Primary color picker"
            />
            <input
              type="text"
              value={config.primaryColor}
              onChange={(e) => {
                setConfig({ ...config, primaryColor: e.target.value });
                clearFeedback();
              }}
              placeholder="#1A73E8"
              className="flex-1 px-3 py-2 rounded-lg bg-slate-900 text-white border border-white/10 focus:border-cyan-500 outline-none transition-colors text-sm font-mono"
              aria-label="Primary color hex value"
            />
          </div>
          <p className="text-xs text-zinc-500 mt-1">Enter a hex color code (e.g., #FF0000)</p>
        </div>

        {/* Logo URL Input */}
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-2 font-agrandir">
            Logo URL
          </label>
          <input
            type="text"
            placeholder="https://example.com/logo.png"
            value={config.logoUrl}
            onChange={(e) => {
              setConfig({ ...config, logoUrl: e.target.value });
              clearFeedback();
            }}
            className="w-full px-3 py-2 rounded-lg bg-slate-900 text-white border border-white/10 focus:border-cyan-500 outline-none transition-colors text-sm"
            aria-label="Logo URL"
          />
          <p className="text-xs text-zinc-500 mt-1">Optional: provide a direct URL to your logo image</p>
        </div>

        {/* Header Background */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-xl border border-white/10 bg-slate-900/40 p-4">
            <p className="text-xs font-semibold text-white mb-3">Header Background</p>
            <div className="space-y-3">
              <select
                value={config.headerConfig?.type ?? ''}
                onChange={(e) => {
                  const value = e.target.value as BackgroundType | '';
                  updateSection('headerConfig', value ? { type: value } : undefined);
                  clearFeedback();
                }}
                className="w-full px-3 py-2 rounded-lg bg-slate-900 text-white border border-white/10 focus:border-cyan-500 outline-none transition-colors text-sm"
                aria-label="Header background type"
              >
                <option value="">None</option>
                <option value="solid">Solid</option>
                <option value="gradient">Gradient</option>
              </select>

              {config.headerConfig && (
                <>
                  <div className="flex gap-3 items-center">
                    <input
                      type="color"
                      value={config.headerConfig.colorStart}
                      onChange={(e) => {
                        updateSection('headerConfig', { colorStart: e.target.value });
                        clearFeedback();
                      }}
                      className="w-10 h-10 rounded-lg cursor-pointer border border-white/10"
                      aria-label="Header start color picker"
                    />
                    <input
                      type="text"
                      value={config.headerConfig.colorStart}
                      onChange={(e) => {
                        updateSection('headerConfig', { colorStart: e.target.value });
                        clearFeedback();
                      }}
                      placeholder="#1A73E8"
                      className="flex-1 px-3 py-2 rounded-lg bg-slate-900 text-white border border-white/10 focus:border-cyan-500 outline-none transition-colors text-sm font-mono"
                      aria-label="Header start color"
                    />
                  </div>

                  {config.headerConfig.type === 'gradient' && (
                    <div className="flex gap-3 items-center">
                      <input
                        type="color"
                        value={config.headerConfig.colorEnd}
                        onChange={(e) => {
                          updateSection('headerConfig', { colorEnd: e.target.value });
                          clearFeedback();
                        }}
                        className="w-10 h-10 rounded-lg cursor-pointer border border-white/10"
                        aria-label="Header end color picker"
                      />
                      <input
                        type="text"
                        value={config.headerConfig.colorEnd}
                        onChange={(e) => {
                          updateSection('headerConfig', { colorEnd: e.target.value });
                          clearFeedback();
                        }}
                        placeholder="#34A853"
                        className="flex-1 px-3 py-2 rounded-lg bg-slate-900 text-white border border-white/10 focus:border-cyan-500 outline-none transition-colors text-sm font-mono"
                        aria-label="Header end color"
                      />
                    </div>
                  )}

                  <input
                    type="text"
                    placeholder="https://cdn.example.com/header-bg.jpg"
                    value={config.headerConfig.image ?? ''}
                    onChange={(e) => {
                      updateSection('headerConfig', { image: e.target.value });
                      clearFeedback();
                    }}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 text-white border border-white/10 focus:border-cyan-500 outline-none transition-colors text-sm"
                    aria-label="Header background image URL"
                  />
                </>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-slate-900/40 p-4">
            <p className="text-xs font-semibold text-white mb-3">Footer Background</p>
            <div className="space-y-3">
              <select
                value={config.footerConfig?.type ?? ''}
                onChange={(e) => {
                  const value = e.target.value as BackgroundType | '';
                  updateSection('footerConfig', value ? { type: value } : undefined);
                  clearFeedback();
                }}
                className="w-full px-3 py-2 rounded-lg bg-slate-900 text-white border border-white/10 focus:border-cyan-500 outline-none transition-colors text-sm"
                aria-label="Footer background type"
              >
                <option value="">None</option>
                <option value="solid">Solid</option>
                <option value="gradient">Gradient</option>
              </select>

              {config.footerConfig && (
                <>
                  <div className="flex gap-3 items-center">
                    <input
                      type="color"
                      value={config.footerConfig.colorStart}
                      onChange={(e) => {
                        updateSection('footerConfig', { colorStart: e.target.value });
                        clearFeedback();
                      }}
                      className="w-10 h-10 rounded-lg cursor-pointer border border-white/10"
                      aria-label="Footer start color picker"
                    />
                    <input
                      type="text"
                      value={config.footerConfig.colorStart}
                      onChange={(e) => {
                        updateSection('footerConfig', { colorStart: e.target.value });
                        clearFeedback();
                      }}
                      placeholder="#1A73E8"
                      className="flex-1 px-3 py-2 rounded-lg bg-slate-900 text-white border border-white/10 focus:border-cyan-500 outline-none transition-colors text-sm font-mono"
                      aria-label="Footer start color"
                    />
                  </div>

                  {config.footerConfig.type === 'gradient' && (
                    <div className="flex gap-3 items-center">
                      <input
                        type="color"
                        value={config.footerConfig.colorEnd}
                        onChange={(e) => {
                          updateSection('footerConfig', { colorEnd: e.target.value });
                          clearFeedback();
                        }}
                        className="w-10 h-10 rounded-lg cursor-pointer border border-white/10"
                        aria-label="Footer end color picker"
                      />
                      <input
                        type="text"
                        value={config.footerConfig.colorEnd}
                        onChange={(e) => {
                          updateSection('footerConfig', { colorEnd: e.target.value });
                          clearFeedback();
                        }}
                        placeholder="#34A853"
                        className="flex-1 px-3 py-2 rounded-lg bg-slate-900 text-white border border-white/10 focus:border-cyan-500 outline-none transition-colors text-sm font-mono"
                        aria-label="Footer end color"
                      />
                    </div>
                  )}

                  <input
                    type="text"
                    placeholder="https://cdn.example.com/footer-bg.jpg"
                    value={config.footerConfig.image ?? ''}
                    onChange={(e) => {
                      updateSection('footerConfig', { image: e.target.value });
                      clearFeedback();
                    }}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 text-white border border-white/10 focus:border-cyan-500 outline-none transition-colors text-sm"
                    aria-label="Footer background image URL"
                  />
                </>
              )}
            </div>
          </div>
        </div>

        {/* Widget Position Select */}
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-2 font-agrandir">
            Widget Position
          </label>
          <select
            value={config.widgetPosition}
            onChange={(e) => {
              setConfig({
                ...config,
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

      {/* Feedback Messages */}
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

      {/* Save Button */}
      <button
        onClick={handleSave}
        disabled={isLoading}
        className="mt-6 w-full py-2.5 rounded-lg bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white font-semibold text-sm transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-cyan-500/10 hover:shadow-cyan-500/20 font-agrandir"
        aria-busy={isLoading}
      >
        {isLoading ? 'Saving...' : 'Save Configuration'}
      </button>

      {/* Helper Text */}
      <p className="text-xs text-zinc-500 mt-3 text-center">
        Changes will be applied immediately across your widget
      </p>
    </div>
  );
}