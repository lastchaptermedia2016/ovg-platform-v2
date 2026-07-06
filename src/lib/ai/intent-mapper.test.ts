import { describe, it, expect } from 'vitest';
import { mapIntentToActions } from './intent-mapper';
import { CanonicalWidgetConfigSchema } from '../schemas/tenant-config.canonical';

describe('mapIntentToActions', () => {
  it('resolves a single header color change into one validated intent', () => {
    const result = mapIntentToActions({
      utterance: 'Update the header to #1A73E8',
      draft: { activeThemeName: 'Standard' },
    });

    expect(result.status).toBe('PLAN_READY');
    if (result.status !== 'PLAN_READY') return;

    expect(result.intents).toHaveLength(1);
    expect(result.intents[0].actionId).toBe('UPDATE_WIDGET_CONFIG');
    expect(result.intents[0].payload.branding?.headerConfig).toMatchObject({
      type: 'solid',
      colorStart: '#1A73E8',
    });
    expect(result.intents[0].confirmationPreview).toContain('#1A73E8');
    expect(result.intents[0].confirmationPreview).toContain("Standard");
    expect(result.planPreview).toMatch(/Should I proceed\?$/);
  });

  it('supports atomic multistep: header + AI badge → two sequential intents', () => {
    const result = mapIntentToActions({
      utterance: 'Update the header to #1A73E8 and turn on the AI insights badge',
    });

    expect(result.status).toBe('PLAN_READY');
    if (result.status !== 'PLAN_READY') return;

    expect(result.intents).toHaveLength(2);
    const badges = result.intents.filter(
      (i) => i.payload.features?.aiInsightBadge === true
    );
    const headers = result.intents.filter(
      (i) => i.payload.branding?.headerConfig !== undefined
    );
    expect(badges).toHaveLength(1);
    expect(headers).toHaveLength(1);
    expect(result.planPreview).toContain('2 changes');
  });

  it('resolves a gradient into headerConfig gradient shape', () => {
    const result = mapIntentToActions({
      utterance: 'Set the header gradient from #FF0000 to #0000FF',
    });
    expect(result.status).toBe('PLAN_READY');
    if (result.status !== 'PLAN_READY') return;
    expect(result.intents[0].payload.branding?.headerConfig).toMatchObject({
      type: 'gradient',
      colorStart: '#FF0000',
      colorEnd: '#0000FF',
    });
  });

  it('returns CLARIFICATION_REQUIRED when intent is ambiguous', () => {
    const result = mapIntentToActions({ utterance: 'change the header' });
    expect(result.status).toBe('CLARIFICATION_REQUIRED');
    if (result.status !== 'CLARIFICATION_REQUIRED') return;
    expect(result.question.length).toBeGreaterThan(0);
    expect(result.missing.length).toBeGreaterThan(0);
  });

  it('returns NO_OP for unrelated utterances', () => {
    const result = mapIntentToActions({ utterance: 'what is the weather today' });
    expect(result.status).toBe('NO_OP');
  });

  it('produces only well-formed canonical payloads (schema enforced per step)', () => {
    const result = mapIntentToActions({
      utterance: 'enable the AI badge and turn on custom css',
    });
    expect(result.status).toBe('PLAN_READY');
    if (result.status !== 'PLAN_READY') return;
    for (const intent of result.intents) {
      expect(() =>
        CanonicalWidgetConfigSchema.parse(intent.payload)
      ).not.toThrow();
    }
  });

  it('resolves a concierge persona switch into an UPDATE_PERSONA intent', () => {
    const result = mapIntentToActions({ utterance: 'switch to concierge mode' });
    expect(result.status).toBe('PLAN_READY');
    if (result.status !== 'PLAN_READY') return;
    const persona = result.intents.find((i) => i.actionId === 'UPDATE_PERSONA');
    expect(persona).toBeDefined();
    expect((persona!.payload as { mode?: string }).mode).toBe('concierge');
    expect(persona!.confirmationPreview).toContain('concierge');
  });

  it('resolves a sales persona switch when a mode-intent phrase is present', () => {
    const result = mapIntentToActions({ utterance: 'set the persona to sales' });
    expect(result.status).toBe('PLAN_READY');
    if (result.status !== 'PLAN_READY') return;
    const persona = result.intents.find((i) => i.actionId === 'UPDATE_PERSONA');
    expect(persona).toBeDefined();
    expect((persona!.payload as { mode?: string }).mode).toBe('sales');
  });
});
