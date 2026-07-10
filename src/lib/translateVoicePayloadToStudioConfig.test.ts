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
});
