import { describe, it, expect } from 'vitest';
import { safeParseClientWidgetStudio, ClientAIPersonaSchema } from './client-config.schema';

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
