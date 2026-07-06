import { describe, it, expect } from 'vitest';
import {
  migrateLegacyConfig,
  hasLegacyFlatFields,
  hasMissingNestedStructures,
  safeParseCanonicalWidgetConfig,
  validateCanonicalWidgetConfig,
} from './transform';

describe('migrateLegacyConfig', () => {
  it('maps basic flat fields into nested canonical structures', () => {
    const legacy = {
      headerBackground: '#FF0000',
      headerOpacity: 0.8,
      aiInsightBadge: true,
      systemPrompt: 'You are a helpful assistant.',
    };

    const result = migrateLegacyConfig(legacy);

    expect(result.branding?.headerConfig).toMatchObject({
      colorStart: '#FF0000',
      opacity: 0.8,
    });
    expect(result.branding?.primaryColor).toBe('#FF0000');
    expect(result.features?.aiInsightBadge).toBe(true);
    expect(result.ai_settings?.systemPrompt).toBe('You are a helpful assistant.');
  });

  it('maps full flat fields (gradient/footer/features/ai) into nested structures', () => {
    const legacy = {
      headerBackground: '#FF5733',
      headerBackgroundType: 'gradient',
      headerGradientStart: '#FF5733',
      headerGradientEnd: '#FF8C00',
      headerOpacity: 0.7,
      footerBackground: '#1A73E8',
      footerBackgroundType: 'solid',
      footerOpacity: 0.9,
      logoUrl: 'https://cdn.example.com/logo.png',
      customCssCode: '.widget { color: red; }',
      aiInsightBadge: true,
      aiDesignMirror: false,
      customCss: true,
      systemPrompt: 'Help users book demos.',
      model: 'claude-3-sonnet',
      temperature: 0.5,
      voiceId: 'v_abc123',
    };

    const result = migrateLegacyConfig(legacy);

    expect(result.branding?.headerConfig).toMatchObject({
      type: 'gradient',
      colorStart: '#FF5733',
      colorEnd: '#FF8C00',
      opacity: 0.7,
    });
    expect(result.branding?.footerConfig).toMatchObject({
      type: 'solid',
      colorStart: '#1A73E8',
      opacity: 0.9,
    });
    expect(result.branding?.accentColor).toBe('#1A73E8');
    expect(result.branding?.logoUrl).toBe('https://cdn.example.com/logo.png');
    expect(result.branding?.customCssCode).toBe('.widget { color: red; }');
    expect(result.features).toMatchObject({
      aiInsightBadge: true,
      aiDesignMirror: false,
      customCss: true,
    });
    expect(result.ai_settings).toMatchObject({
      systemPrompt: 'Help users book demos.',
      model: 'claude-3-sonnet',
      temperature: 0.5,
      voiceId: 'v_abc123',
    });
  });

  it('preserves existing nested structures via deep merge', () => {
    const legacy = {
      headerBackground: '#FF0000',
      branding: {
        headerConfig: { colorStart: '#000000', opacity: 0.5 },
        widgetPosition: 'bottom-left',
      },
    };

    const result = migrateLegacyConfig(legacy);

    expect(result.branding?.headerConfig?.colorStart).toBe('#FF0000');
    expect(result.branding?.headerConfig?.opacity).toBe(0.5);
    expect(result.branding?.widgetPosition).toBe('bottom-left');
  });

  it('keeps legacy flat fields intact (zero data loss)', () => {
    const legacy = { headerBackground: '#FF0000', aiInsightBadge: true };
    const result = migrateLegacyConfig(legacy);
    const record = result as Record<string, unknown>;

    expect(record.headerBackground).toBe('#FF0000');
    expect(record.aiInsightBadge).toBe(true);
  });

  it('produces output that validates against CanonicalWidgetConfigSchema', () => {
    const legacy = {
      headerBackground: '#FF0000',
      headerOpacity: 0.8,
      aiInsightBadge: true,
      systemPrompt: 'You are a helpful assistant.',
    };

    const result = migrateLegacyConfig(legacy);
    expect(safeParseCanonicalWidgetConfig(result).success).toBe(true);
    expect(() => validateCanonicalWidgetConfig(result)).not.toThrow();
  });
});

describe('detection helpers', () => {
  it('hasLegacyFlatFields detects known flat fields', () => {
    expect(hasLegacyFlatFields({ headerBackground: '#000' })).toBe(true);
    expect(hasLegacyFlatFields({ branding: {} })).toBe(false);
  });

  it('hasMissingNestedStructures detects when nested shapes are absent', () => {
    expect(hasMissingNestedStructures({ headerBackground: '#000' })).toBe(true);
    expect(hasMissingNestedStructures({ branding: { headerConfig: {} } })).toBe(false);
  });
});
