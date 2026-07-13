import { describe, it, expect } from 'vitest';
import { translateVoicePayloadToStudioConfig } from './translateVoicePayloadToStudioConfig';

describe('translateVoicePayloadToStudioConfig', () => {
  it('maps payload.widget.bodyOpacity/bodyBackground into branding', () => {
    const { studioConfig } = translateVoicePayloadToStudioConfig({
      widget: { bodyOpacity: 0.5, bodyBackground: 'none' },
    });

    expect(Object.keys(studioConfig).length).toBeGreaterThan(0);
    expect(studioConfig.branding).toMatchObject({
      widgetBodyOpacity: 0.5,
      widgetBodyBackground: 'none',
    });
  });

  it('maps legacy widget.opacity/widget.background aliases into branding', () => {
    const { studioConfig } = translateVoicePayloadToStudioConfig({
      widget: { opacity: 0.4, background: 'rgba(255,255,255,0.5)' },
    });

    expect(studioConfig.branding).toMatchObject({
      widgetBodyOpacity: 0.4,
      widgetBodyBackground: 'rgba(255,255,255,0.5)',
    });
  });

  it('still produces an empty studioConfig for a payload with no recognizable keys', () => {
    const { studioConfig } = translateVoicePayloadToStudioConfig({ foo: 'bar' });
    expect(Object.keys(studioConfig)).toHaveLength(0);
  });

  it('normalizes CSS color names emitted by the LLM to #rrggbb', () => {
    const { studioConfig } = translateVoicePayloadToStudioConfig({
      theme: { primary: 'red', backgroundType: 'solid' },
      widget: { bodyBackground: 'blue' },
    });

    expect(studioConfig.branding).toMatchObject({
      primaryColor: '#ff0000',
      widgetBodyBackground: '#0000ff',
    });
    expect((studioConfig.branding as Record<string, unknown>).headerConfig).toMatchObject({ colorStart: '#ff0000' });
  });

  it('rejects raw non-hex color phrases (gradients, names) and omits the field', () => {
    const { studioConfig } = translateVoicePayloadToStudioConfig({
      theme: {
        primary: 'gradient yellow and blue',
        secondary: 'not-a-real-color',
        backgroundType: 'solid',
        primaryGradientStart: 'linear-gradient(135deg, #667eea, #764ba2)',
        primaryGradientEnd: 'rgba(0,0,0,0.5)',
        secondaryGradientStart: 'sunset orange',
      },
    });

    const branding = studioConfig.branding as Record<string, unknown>;
    // Solid color inputs must NOT receive invalid CSS — the keys are omitted so
    // the downstream partial merge preserves the existing valid color.
    expect(branding.primaryColor).toBeUndefined();
    expect(branding.accentColor).toBeUndefined();

    const headerConfig = branding.headerConfig as Record<string, unknown>;
    expect(headerConfig.colorStart).toBeUndefined();
    expect(headerConfig.colorEnd).toBeUndefined();

    const footerConfig = branding.footerConfig as Record<string, unknown>;
    expect(footerConfig.colorStart).toBeUndefined();
    expect(footerConfig.colorEnd).toBeUndefined();
  });

  it('keeps 3-digit hex after expanding to 6-digit, but drops 8-digit/alpha', () => {
    const { studioConfig } = translateVoicePayloadToStudioConfig({
      theme: { primary: '#f00', secondary: '#12345678' },
    });

    const branding = studioConfig.branding as Record<string, unknown>;
    expect(branding.primaryColor).toBe('#ff0000'); // expanded to strict hex
    expect(branding.accentColor).toBeUndefined(); // alpha not a solid color input
  });

  it('composes widget body gradient endpoints into a CSS gradient string', () => {
    const { studioConfig } = translateVoicePayloadToStudioConfig({
      widget: { bodyGradientStart: '#0000ff', bodyGradientEnd: '#008000' },
    });

    const branding = studioConfig.branding as Record<string, unknown>;
    expect(branding.widgetBodyBackground).toBe('linear-gradient(135deg, #0000ff, #008000)');
  });

  it('drops a widget body gradient when an endpoint fails the hex check (preserves current)', () => {
    const { studioConfig } = translateVoicePayloadToStudioConfig({
      widget: { bodyGradientStart: 'blue', bodyGradientEnd: 'not-a-color' },
    });

    const branding = studioConfig.branding as Record<string, unknown> | undefined;
    // 'blue' -> #0000ff is valid, but 'not-a-color' is not, so the pair is unsafe.
    expect(branding?.widgetBodyBackground).toBeUndefined();
  });

  it('maps a single multi-surface gradient command across header, footer, and body', () => {
    const { studioConfig } = translateVoicePayloadToStudioConfig({
      theme: {
        backgroundType: 'gradient',
        primaryGradientStart: '#0000ff',
        primaryGradientEnd: '#008000',
        secondaryGradientStart: '#0000ff',
        secondaryGradientEnd: '#008000',
      },
      widget: { bodyGradientStart: '#0000ff', bodyGradientEnd: '#008000' },
    });

    const branding = studioConfig.branding as Record<string, unknown>;
    const headerConfig = branding.headerConfig as Record<string, unknown>;
    const footerConfig = branding.footerConfig as Record<string, unknown>;

    // Header + footer two-stop pairs, both defaulted to a renderable gradient.
    expect(headerConfig).toMatchObject({
      type: 'gradient',
      colorStart: '#0000ff',
      colorEnd: '#008000',
    });
    expect(footerConfig).toMatchObject({
      type: 'gradient',
      colorStart: '#0000ff',
      colorEnd: '#008000',
    });

    // Widget body composed into a CSS gradient string for widgetBodyBackground.
    expect(branding.widgetBodyBackground).toBe('linear-gradient(135deg, #0000ff, #008000)');
  });
});
