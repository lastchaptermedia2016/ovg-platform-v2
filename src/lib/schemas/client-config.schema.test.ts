import { describe, it, expect } from 'vitest';
import {
  safeParseClientWidgetStudio,
  ClientAIPersonaSchema,
  ClientWidgetStudioSchema,
  ClientLayerConfigSchema,
} from './client-config.schema';

describe('ClientAIPersonaSchema — personaMode support', () => {
  it('accepts a persona-only payload (voice path)', () => {
    const result = safeParseClientWidgetStudio({ aiPersona: { personaMode: 'concierge' } });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.aiPersona?.personaMode).toBe('concierge');
    }
  });

  it('accepts a sales persona-only payload', () => {
    const result = safeParseClientWidgetStudio({ aiPersona: { personaMode: 'sales' } });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid personaMode value', () => {
    const result = ClientAIPersonaSchema.safeParse({ personaMode: 'banana' });
    expect(result.success).toBe(false);
  });

  it('no longer requires name/voiceId for persona-only saves', () => {
    const result = ClientAIPersonaSchema.safeParse({ personaMode: 'sales' });
    expect(result.success).toBe(true);
  });

  it('still validates a full persona with name + voiceId', () => {
    const result = ClientAIPersonaSchema.safeParse({
      name: 'Zeeder',
      voiceId: 'voice-123',
      personality: 'professional',
      personaMode: 'concierge',
    });
    expect(result.success).toBe(true);
  });

  it('coerces empty-string optional fields (from toCanonicalAIPersona) to undefined', () => {
    // Simulates persona/page.tsx sending { name, voiceId: '', personaMode }.
    const result = safeParseClientWidgetStudio({
      aiPersona: {
        name: 'Concierge Assistant',
        voiceId: '',
        personaMode: 'concierge',
      },
    });
    expect(result.success).toBe(true);
  });
});

describe('ClientWidgetStudioSchema — features block (AI add-ons)', () => {
  // Regression lock for the silent-drop bug fixed in dispatchUpdateStudioConfig.
  // The Zeeder reseller studio (ClientBrandingStudio.tsx:928-948) reads
  // widget_config.features by key, so the schema that governs the persisted
  // shape MUST preserve every features flag rather than dropping it on parse.
  const featuresFixture = {
    aiInsightBadge: true,
    aiDesignMirror: true,
    customCss: true,
    customCssCode: '.widget-container { backdrop-filter: blur(12px); }',
  };

  it('parses and preserves the full features block', () => {
    const result = ClientWidgetStudioSchema.safeParse({ features: featuresFixture });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.features).toEqual(featuresFixture);
    }
  });

  it('round-trips features alongside branding + aiPersona (multi-block payload)', () => {
    const config = {
      branding: { primaryColor: '#008080', headerConfig: { type: 'solid', colorStart: '#008080' } },
      aiPersona: { personaMode: 'concierge' },
      features: featuresFixture,
    };
    const result = safeParseClientWidgetStudio(config);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.features).toEqual(featuresFixture);
      expect(result.data.branding?.primaryColor).toBe('#008080');
      expect(result.data.aiPersona?.personaMode).toBe('concierge');
    }
  });

  it('keeps customCssCode so custom CSS injection survives end-to-end', () => {
    const result = safeParseClientWidgetStudio({ features: { customCss: true, customCssCode: '.x{}' } });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.features?.customCss).toBe(true);
      expect(result.data.features?.customCssCode).toBe('.x{}');
    }
  });

  it('defaults each flag to undefined (not false) when omitted', () => {
    const result = ClientWidgetStudioSchema.safeParse({ features: {} });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.features?.aiInsightBadge).toBeUndefined();
      expect(result.data.features?.customCss).toBeUndefined();
    }
  });
});

describe('ClientLayerConfigSchema — opacity regression', () => {
  it('accepts opacity of 0 for voice/theme pipeline compatibility', () => {
    const result = ClientLayerConfigSchema.safeParse({
      type: 'solid',
      value: '#FF0000',
      opacity: 0,
      backdropBlur: false,
    });
    expect(result.success).toBe(true);
  });
});
