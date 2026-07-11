import { describe, it, expect } from 'vitest';
import {
  HexColorSchema,
  URLSchema,
  BrandingSchema,
  ThemeSchema,
  IntegrationsSchema,
  FeaturesSchema,
  AISettingsSchema,
  WidgetConfigSchema,
  CustomAssetsSchema,
  validateWidgetConfig,
  safeParseWidgetConfig,
  validateCustomAssets,
  safeParseCustomAssets,
  extractConfigValue,
  mergeWidgetConfigs,
  type WidgetConfig,
  type CustomAssets,
} from './tenant-config.schema';
import { LayerConfigSchema } from './tenant-config.canonical';

// ============================================================================
// HexColorSchema Tests
// ============================================================================

describe('HexColorSchema', () => {
  it('accepts valid 6-digit hex colors', () => {
    expect(() => HexColorSchema.parse('#FF5733')).not.toThrow();
    expect(() => HexColorSchema.parse('#1A73E8')).not.toThrow();
    expect(() => HexColorSchema.parse('#FFFFFF')).not.toThrow();
    expect(() => HexColorSchema.parse('#000000')).not.toThrow();
  });

  it('accepts valid 8-digit hex colors with alpha', () => {
    expect(() => HexColorSchema.parse('#FF5733AA')).not.toThrow();
    expect(() => HexColorSchema.parse('#1A73E880')).not.toThrow();
  });

  it('rejects invalid hex colors', () => {
    expect(() => HexColorSchema.parse('FF5733')).toThrow(); // Missing #
    expect(() => HexColorSchema.parse('#FF57')).toThrow(); // Too short
    expect(() => HexColorSchema.parse('#FF57339')).toThrow(); // Invalid length
    expect(() => HexColorSchema.parse('rgb(255, 87, 51)')).toThrow(); // Wrong format
    expect(() => HexColorSchema.parse('red')).toThrow(); // Named color
  });

  it('is case-insensitive', () => {
    expect(() => HexColorSchema.parse('#ff5733')).not.toThrow();
    expect(() => HexColorSchema.parse('#FF5733')).not.toThrow();
    expect(() => HexColorSchema.parse('#Ff5733')).not.toThrow();
  });
});

// ============================================================================
// URLSchema Tests
// ============================================================================

describe('URLSchema', () => {
  it('accepts absolute URLs', () => {
    expect(() => URLSchema.parse('https://example.com')).not.toThrow();
    expect(() => URLSchema.parse('https://cdn.example.com/logo.png')).not.toThrow();
    expect(() => URLSchema.parse('http://example.com')).not.toThrow();
  });

  it('accepts relative URLs', () => {
    expect(() => URLSchema.parse('/images/logo.png')).not.toThrow();
    expect(() => URLSchema.parse('/assets/branding')).not.toThrow();
  });

  it('rejects invalid URLs', () => {
    expect(() => URLSchema.parse('not a url')).toThrow();
    expect(() => URLSchema.parse('example.com')).toThrow(); // Missing protocol
  });
});

// ============================================================================
// BrandingSchema Tests
// ============================================================================

describe('BrandingSchema', () => {
  it('accepts valid branding configuration', () => {
    const branding = {
      primaryColor: '#1A73E8',
      accentColor: '#34A853',
      logoUrl: 'https://cdn.example.com/logo.png',
      widgetBodyOpacity: 0.95,
      widgetBodyBackground: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    };
    expect(() => BrandingSchema.parse(branding)).not.toThrow();
  });

  it('allows partial branding configuration', () => {
    expect(() => BrandingSchema.parse({ primaryColor: '#1A73E8' })).not.toThrow();
    expect(() => BrandingSchema.parse({ logoUrl: 'https://example.com/logo.png' })).not.toThrow();
    expect(() => BrandingSchema.parse({})).not.toThrow();
  });

  it('validates hex colors in branding', () => {
    const invalid = {
      primaryColor: 'not-a-color',
      accentColor: '#34A853',
    };
    expect(() => BrandingSchema.parse(invalid)).toThrow();
  });

  it('validates opacity is between 0 and 1', () => {
    const valid = { widgetBodyOpacity: 0.5 };
    expect(() => BrandingSchema.parse(valid)).not.toThrow();

    const invalid = { widgetBodyOpacity: 1.5 };
    expect(() => BrandingSchema.parse(invalid)).toThrow();
  });

  it('allows unknown properties via passthrough', () => {
    const branding = {
      primaryColor: '#1A73E8',
      customProperty: 'custom-value',
    };
    const result = BrandingSchema.parse(branding);
    expect(result).toHaveProperty('customProperty', 'custom-value');
  });
});

// ============================================================================
// ThemeSchema Tests
// ============================================================================

describe('ThemeSchema', () => {
  it('accepts valid theme configuration', () => {
    const theme = {
      colors: {
        primary: '#1A73E8',
        secondary: '#34A853',
        error: '#D33B27',
      },
      fonts: {
        heading: 'Inter, sans-serif',
        body: 'Roboto, sans-serif',
      },
      spacing: { xs: 4, sm: 8, md: 16 },
      borderRadius: { sm: 4, md: 8, lg: 12 },
    };
    expect(() => ThemeSchema.parse(theme)).not.toThrow();
  });

  it('validates hex colors in theme colors', () => {
    const invalid = {
      colors: {
        primary: 'not-a-color',
      },
    };
    expect(() => ThemeSchema.parse(invalid)).toThrow();
  });

  it('allows partial theme configuration', () => {
    expect(() => ThemeSchema.parse({})).not.toThrow();
    expect(() => ThemeSchema.parse({ colors: { primary: '#1A73E8' } })).not.toThrow();
    expect(() => ThemeSchema.parse({ spacing: { xs: 4 } })).not.toThrow();
  });
});

// ============================================================================
// IntegrationsSchema Tests
// ============================================================================

describe('IntegrationsSchema', () => {
  it('accepts valid integrations configuration', () => {
    const integrations = {
      domains: ['example.com', 'www.example.com'],
      webhooks: {
        'message.sent': {
          url: 'https://webhook.example.com/events',
          events: ['message.sent', 'message.failed'],
        },
      },
      endpoints: {
        analytics: 'https://analytics.example.com/api',
        crm: 'https://crm.example.com/api',
      },
    };
    expect(() => IntegrationsSchema.parse(integrations)).not.toThrow();
  });

  it('validates webhook URLs', () => {
    const invalid = {
      webhooks: {
        'message.sent': {
          url: 'not-a-url',
        },
      },
    };
    expect(() => IntegrationsSchema.parse(invalid)).toThrow();
  });

  it('allows domains array to replace existing', () => {
    const integrations = {
      domains: ['new.com', 'domains.com'],
    };
    const result = IntegrationsSchema.parse(integrations);
    expect(result.domains).toEqual(['new.com', 'domains.com']);
  });

  it('allows empty integrations configuration', () => {
    expect(() => IntegrationsSchema.parse({})).not.toThrow();
  });
});

// ============================================================================
// FeaturesSchema Tests
// ============================================================================

describe('FeaturesSchema', () => {
  it('accepts valid features configuration', () => {
    const features = {
      aiInsightBadge: true,
      aiDesignMirror: false,
      customCss: true,
    };
    expect(() => FeaturesSchema.parse(features)).not.toThrow();
  });

  it('allows partial features configuration', () => {
    expect(() => FeaturesSchema.parse({ aiInsightBadge: true })).not.toThrow();
    expect(() => FeaturesSchema.parse({})).not.toThrow();
  });

  it('validates boolean values', () => {
    const invalid = {
      aiInsightBadge: 'true', // String instead of boolean
    };
    expect(() => FeaturesSchema.parse(invalid)).toThrow();
  });
});

// ============================================================================
// AISettingsSchema Tests
// ============================================================================

describe('AISettingsSchema', () => {
  it('accepts valid AI settings', () => {
    const aiSettings = {
      systemPrompt: 'You are a helpful customer service AI.',
      model: 'gpt-4',
      temperature: 0.7,
      maxTokens: 512,
    };
    expect(() => AISettingsSchema.parse(aiSettings)).not.toThrow();
  });

  it('validates temperature is between 0 and 2', () => {
    const valid = { temperature: 1.5 };
    expect(() => AISettingsSchema.parse(valid)).not.toThrow();

    const invalid = { temperature: 2.5 };
    expect(() => AISettingsSchema.parse(invalid)).toThrow();
  });

  it('validates maxTokens is positive', () => {
    const valid = { maxTokens: 512 };
    expect(() => AISettingsSchema.parse(valid)).not.toThrow();

    const invalid = { maxTokens: -1 };
    expect(() => AISettingsSchema.parse(invalid)).toThrow();
  });

  it('allows partial AI settings', () => {
    expect(() => AISettingsSchema.parse({ model: 'gpt-4' })).not.toThrow();
    expect(() => AISettingsSchema.parse({})).not.toThrow();
  });
});

// ============================================================================
// WidgetConfigSchema Tests
// ============================================================================

describe('WidgetConfigSchema', () => {
  it('accepts complete widget configuration', () => {
    const config: WidgetConfig = {
      branding: {
        primaryColor: '#1A73E8',
        logoUrl: 'https://cdn.example.com/logo.png',
      },
      theme: {
        colors: { primary: '#1A73E8' },
        fonts: { heading: 'Inter' },
      },
      integrations: {
        domains: ['example.com'],
      },
      features: {
        aiInsightBadge: true,
      },
      ai_settings: {
        temperature: 0.7,
      },
    };
    expect(() => WidgetConfigSchema.parse(config)).not.toThrow();
  });

  it('accepts partial widget configuration', () => {
    const minimal = {
      branding: { primaryColor: '#1A73E8' },
    };
    expect(() => WidgetConfigSchema.parse(minimal)).not.toThrow();

    expect(() => WidgetConfigSchema.parse({})).not.toThrow();
  });

  it('validates nested structures', () => {
    const config = {
      branding: {
        primaryColor: 'invalid-color',
      },
    };
    expect(() => WidgetConfigSchema.parse(config)).toThrow();
  });

  it('allows unknown root-level properties via passthrough', () => {
    const config = {
      branding: { primaryColor: '#1A73E8' },
      customExtension: { foo: 'bar' },
    };
    const result = WidgetConfigSchema.parse(config);
    expect(result).toHaveProperty('customExtension');
  });

  it('validates complete realistic configuration', () => {
    const config: WidgetConfig = {
      branding: {
        primaryColor: '#1A73E8',
        accentColor: '#34A853',
        logoUrl: 'https://cdn.example.com/logo.png',
        widgetBodyOpacity: 0.95,
        widgetBodyBackground: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      },
      theme: {
        colors: {
          primary: '#1A73E8',
          secondary: '#34A853',
          error: '#D33B27',
        },
        fonts: {
          heading: 'Inter, sans-serif',
          body: 'Roboto, sans-serif',
        },
        spacing: { xs: 4, sm: 8, md: 16 },
        borderRadius: { sm: 4, md: 8, lg: 12 },
      },
      integrations: {
        domains: ['example.com', 'www.example.com'],
        webhooks: {
          'message.sent': {
            url: 'https://webhook.example.com/events',
            events: ['message.sent', 'message.failed'],
          },
        },
        endpoints: {
          analytics: 'https://analytics.example.com/api',
        },
      },
      features: {
        aiInsightBadge: true,
        aiDesignMirror: false,
        customCss: true,
      },
      ai_settings: {
        systemPrompt: 'You are a helpful customer service AI.',
        model: 'gpt-4',
        temperature: 0.7,
        maxTokens: 512,
      },
    };
    expect(() => WidgetConfigSchema.parse(config)).not.toThrow();
  });
});

// ============================================================================
// CustomAssetsSchema Tests
// ============================================================================

describe('CustomAssetsSchema', () => {
  it('accepts valid custom assets configuration', () => {
    const assets: CustomAssets = {
      header_url: 'https://cdn.example.com/header.jpg',
      footer_url: 'https://cdn.example.com/footer.jpg',
      favicon_url: 'https://cdn.example.com/favicon.ico',
      custom_css_url: 'https://cdn.example.com/custom.css',
    };
    expect(() => CustomAssetsSchema.parse(assets)).not.toThrow();
  });

  it('allows null values for asset URLs', () => {
    const assets = {
      header_url: null,
      footer_url: 'https://example.com/footer.jpg',
    };
    expect(() => CustomAssetsSchema.parse(assets)).not.toThrow();
  });

  it('validates asset URLs', () => {
    const invalid = {
      header_url: 'not-a-url',
    };
    expect(() => CustomAssetsSchema.parse(invalid)).toThrow();
  });

  it('allows empty custom assets configuration', () => {
    expect(() => CustomAssetsSchema.parse({})).not.toThrow();
  });

  it('allows relative asset URLs', () => {
    const assets = {
      header_url: '/assets/header.jpg',
      footer_url: '/assets/footer.jpg',
    };
    expect(() => CustomAssetsSchema.parse(assets)).not.toThrow();
  });
});

// ============================================================================
// Validation Utility Tests
// ============================================================================

describe('validateWidgetConfig', () => {
  it('returns valid configuration', () => {
    const config = { branding: { primaryColor: '#1A73E8' } };
    const result = validateWidgetConfig(config);
    expect(result).toEqual(config);
  });

  it('throws on invalid configuration', () => {
    const config = { branding: { primaryColor: 'invalid' } };
    expect(() => validateWidgetConfig(config)).toThrow();
  });
});

describe('safeParseWidgetConfig', () => {
  it('returns success result for valid configuration', () => {
    const config = { branding: { primaryColor: '#1A73E8' } };
    const result = safeParseWidgetConfig(config);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(config);
    }
  });

  it('returns error result for invalid configuration', () => {
    const config = { branding: { primaryColor: 'invalid' } };
    const result = safeParseWidgetConfig(config);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors.length).toBeGreaterThan(0);
    }
  });
});

describe('validateCustomAssets', () => {
  it('returns valid assets', () => {
    const assets = { header_url: 'https://example.com/header.jpg' };
    const result = validateCustomAssets(assets);
    expect(result).toEqual(assets);
  });

  it('throws on invalid assets', () => {
    const assets = { header_url: 'not-a-url' };
    expect(() => validateCustomAssets(assets)).toThrow();
  });
});

describe('safeParseCustomAssets', () => {
  it('returns success result for valid assets', () => {
    const assets = { header_url: 'https://example.com/header.jpg' };
    const result = safeParseCustomAssets(assets);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(assets);
    }
  });

  it('returns error result for invalid assets', () => {
    const assets = { header_url: 'not-a-url' };
    const result = safeParseCustomAssets(assets);
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// extractConfigValue Tests
// ============================================================================

describe('extractConfigValue', () => {
  const config: WidgetConfig = {
    branding: {
      primaryColor: '#1A73E8',
      accentColor: '#34A853',
    },
    theme: {
      colors: {
        primary: '#1A73E8',
      },
    },
  };

  it('extracts nested values with correct type', () => {
    const primaryColor = extractConfigValue(config, HexColorSchema, 'branding.primaryColor');
    expect(primaryColor).toBe('#1A73E8');
  });

  it('returns undefined for missing paths', () => {
    const value = extractConfigValue(config, HexColorSchema, 'branding.nonexistent');
    expect(value).toBeUndefined();
  });

  it('returns undefined for type mismatches', () => {
    const value = extractConfigValue(config, HexColorSchema, 'theme');
    expect(value).toBeUndefined();
  });

  it('extracts deeply nested values', () => {
    const value = extractConfigValue(config, HexColorSchema, 'theme.colors.primary');
    expect(value).toBe('#1A73E8');
  });
});

// ============================================================================
// mergeWidgetConfigs Tests
// ============================================================================

describe('mergeWidgetConfigs', () => {
  it('merges partial configurations', () => {
    const base: WidgetConfig = {
      branding: {
        primaryColor: '#1A73E8',
        logoUrl: 'https://example.com/logo.png',
      },
      features: {
        aiInsightBadge: true,
      },
    };

    const override: Partial<WidgetConfig> = {
      branding: {
        accentColor: '#34A853',
      },
      features: {
        customCss: true,
      },
    };

    const result = mergeWidgetConfigs(base, override);

    // Base branding properties are preserved
    expect(result.branding?.primaryColor).toBe('#1A73E8');
    expect(result.branding?.logoUrl).toBe('https://example.com/logo.png');
    // Override branding properties are added
    expect(result.branding?.accentColor).toBe('#34A853');
    // Features are merged
    expect(result.features?.aiInsightBadge).toBe(true);
    expect(result.features?.customCss).toBe(true);
  });

  it('replaces arrays instead of merging', () => {
    const base: WidgetConfig = {
      integrations: {
        domains: ['old.com', 'domain.com'],
      },
    };

    const override: Partial<WidgetConfig> = {
      integrations: {
        domains: ['new.com'],
      },
    };

    const result = mergeWidgetConfigs(base, override);
    expect(result.integrations?.domains).toEqual(['new.com']);
  });

  it('handles null values in override', () => {
    const base: WidgetConfig = {
      branding: {
        logoUrl: 'https://example.com/logo.png',
      },
    };

    const override: Partial<WidgetConfig> = {
      branding: {
        logoUrl: null,
      },
    };

    const result = mergeWidgetConfigs(base, override);
    expect(result.branding?.logoUrl).toBeNull();
  });

  it('validates result is valid configuration', () => {
    const base: WidgetConfig = {
      branding: { primaryColor: '#1A73E8' },
    };

    const override: Partial<WidgetConfig> = {
      branding: { accentColor: '#34A853' },
    };

    const result = mergeWidgetConfigs(base, override);
    // Should not throw
    expect(() => validateWidgetConfig(result)).not.toThrow();
  });
});

// ============================================================================
// Type Inference Tests
// ============================================================================

describe('Type inference', () => {
  it('correctly infers WidgetConfig type', () => {
    const config: WidgetConfig = {
      branding: {
        primaryColor: '#1A73E8',
      },
      features: {
        aiInsightBadge: true,
      },
    };

    // This should compile without type errors
    expect(config.branding?.primaryColor).toBe('#1A73E8');
    expect(config.features?.aiInsightBadge).toBe(true);
  });

  it('correctly infers CustomAssets type', () => {
    const assets: CustomAssets = {
      header_url: 'https://example.com/header.jpg',
      favicon_url: null,
    };

    expect(assets.header_url).toBe('https://example.com/header.jpg');
    expect(assets.favicon_url).toBeNull();
  });
});

describe('LayerConfigSchema — opacity regression', () => {
  it('allows zero opacity values without throwing validation errors', () => {
    const result = LayerConfigSchema.safeParse({
      type: 'solid',
      value: '#FF0000',
      opacity: 0,
      backdropBlur: false,
    });
    expect(result.success).toBe(true);
  });
});
