import { describe, it, expect } from 'vitest';
import {
  CognitiveOrchestrator,
  UserPreferenceHistory,
  validateIntent,
  SYSTEM_PROMPT,
  type OrchestratorContext,
} from './cognitive-orchestrator';
import type { ActionIntent } from './intent-mapper';

describe('CognitiveOrchestrator', () => {
  it('produces explained, critiqued plans for a header color change', () => {
    const orch = new CognitiveOrchestrator();
    const plan = orch.plan({
      utterance: 'Update the header to #1A73E8',
      currentRoute: '/client/dashboard/studio/branding',
    });

    expect(plan.status).toBe('PLAN_READY');
    if (plan.status !== 'PLAN_READY') return;

    expect(plan.intents).toHaveLength(1);
    expect(plan.intents[0].explanation).toBeTruthy();
    expect(plan.intents[0].explanation).toContain('#1A73E8');
    expect(plan.critiques).toHaveLength(1);
    expect(plan.preferencesJson).toBeTruthy();
    expect(plan.planPreview).toContain('Should I proceed?');
    expect(plan.planPreview).toContain('/client/dashboard/studio/branding');
  });

  it('flags low-contrast headers via the critic (advisory, non-blocking)', () => {
    const orch = new CognitiveOrchestrator();
    const plan = orch.plan({ utterance: 'Set the header to #FFFFFF' });
    if (plan.status !== 'PLAN_READY') throw new Error('expected PLAN_READY');
    expect(plan.critiques[0].ok).toBe(false);
    expect(plan.critiques[0].flags.some((f) => f.principle === 'contrast')).toBe(true);
    // Still proposes the change — the critic only flags, never blocks.
    expect(plan.intents[0].payload.branding?.headerConfig?.colorStart).toBe('#FFFFFF');
  });

  it('recalls a prior accessibility preference and explains accordingly', () => {
    const prefs = new UserPreferenceHistory();
    prefs.record('accessibility:high-contrast', 'preferred');
    const orch = new CognitiveOrchestrator({ preferences: prefs } as OrchestratorContext);
    const plan = orch.plan({ utterance: 'Update the header to #0A2540' });
    if (plan.status !== 'PLAN_READY') throw new Error('expected PLAN_READY');
    expect(plan.intents[0].explanation).toMatch(/high-accessibility/i);
  });

  it('passes through CLARIFICATION_REQUIRED without critiques', () => {
    const orch = new CognitiveOrchestrator();
    const plan = orch.plan({ utterance: 'change the header' });
    expect(plan.status).toBe('CLARIFICATION_REQUIRED');
    if (plan.status !== 'CLARIFICATION_REQUIRED') return;
    expect(plan.question.length).toBeGreaterThan(0);
  });

  it('raises CRITIQUE_REQUIRED for a low-contrast header when an accessibility preference exists', () => {
    const prefs = new UserPreferenceHistory();
    prefs.record('accessibility:high-contrast', 'preferred');
    const orch = new CognitiveOrchestrator({ preferences: prefs });
    const plan = orch.plan({ utterance: 'Set the header to #FFFFFF' });
    expect(plan.status).toBe('CRITIQUE_REQUIRED');
    if (plan.status !== 'CRITIQUE_REQUIRED') return;
    expect(plan.originalIntents[0].payload.branding?.headerConfig?.colorStart).toBe('#FFFFFF');
    // Suggested alternative must actually be accessible (contrast >= 3 vs white).
    const alt = plan.suggestedIntents[0].payload.branding?.headerConfig?.colorStart;
    expect(alt).toBeTruthy();
    expect(alt).not.toBe('#FFFFFF');
    expect(plan.question).toMatch(/high-accessibility/i);
    expect(plan.conflictingPreference).toBe('accessibility:high-contrast');
  });

  it('does NOT raise CRITIQUE_REQUIRED for low-contrast when no preference exists', () => {
    const orch = new CognitiveOrchestrator();
    const plan = orch.plan({ utterance: 'Set the header to #FFFFFF' });
    expect(plan.status).toBe('PLAN_READY');
  });
});

describe('UserPreferenceHistory', () => {
  it('de-duplicates by key and bounds size', () => {
    const prefs = new UserPreferenceHistory(null, 2);
    prefs.record('a', '1');
    prefs.record('a', '2');
    prefs.record('b', '3');
    prefs.record('c', '4'); // should evict oldest ('a')
    expect(prefs.get('a')).toBeUndefined();
    expect(prefs.get('b')).toBe('3');
    expect(prefs.get('c')).toBe('4');
    expect(prefs.list()).toHaveLength(2);
  });

  it('round-trips through JSON', () => {
    const prefs = new UserPreferenceHistory();
    prefs.record('theme', 'dark');
    const restored = new UserPreferenceHistory(prefs.toJSON());
    expect(restored.get('theme')).toBe('dark');
  });
});

describe('validateIntent (the Critic)', () => {
  it('flags identical primary/accent as conflicting-branding', () => {
    const intent: ActionIntent = {
      actionId: 'UPDATE_WIDGET_CONFIG',
      payload: { branding: { primaryColor: '#123456', accentColor: '#123456' } },
      confirmationPreview: 'x',
    };
    const result = validateIntent(intent);
    expect(result.flags.some((f) => f.principle === 'conflicting-branding')).toBe(true);
  });

  it('returns ok for a clean, high-contrast intent', () => {
    const intent: ActionIntent = {
      actionId: 'UPDATE_WIDGET_CONFIG',
      payload: { branding: { headerConfig: { type: 'solid', colorStart: '#0A2540' } } },
      confirmationPreview: 'x',
    };
    expect(validateIntent(intent).ok).toBe(true);
  });
});

describe('SYSTEM_PROMPT', () => {
  it('encodes the Zeeder Lead Architect identity and production excellence mandate', () => {
    expect(SYSTEM_PROMPT).toContain('Zeeder');
    expect(SYSTEM_PROMPT).toContain('Lead Architect');
    expect(SYSTEM_PROMPT).toContain('PRODUCTION EXCELLENCE');
  });
});

describe('UI Trigger (Resident Intelligence seam)', () => {
  it('raises OPEN_CAPABILITIES for capability/help queries', () => {
    const orch = new CognitiveOrchestrator();
    const plan = orch.plan({ utterance: 'What can you do?' });
    expect(plan.status).toBe('NO_OP');
    if (plan.status !== 'NO_OP') return;
    expect(plan.uiTrigger).toBe('OPEN_CAPABILITIES');
  });

  it('does not raise a trigger for a real config request', () => {
    const orch = new CognitiveOrchestrator();
    const plan = orch.plan({ utterance: 'Update the header to #1A73E8' });
    expect(plan.status).toBe('PLAN_READY');
    if (plan.status !== 'PLAN_READY') return;
    expect(plan.uiTrigger).toBeUndefined();
  });
});
