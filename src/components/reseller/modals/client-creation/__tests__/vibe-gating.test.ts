import { describe, it, expect } from 'vitest';
import { classifyVibeInput, MIN_VIBE_LENGTH } from '../vibe-gating';

describe('Step 4 (Vibe) gating', () => {
  // ── Explicit skip signals → satisfies the step via `confirmed` ─────
  it.each([
    'skip',
    'skip it',
    'skip this step',
    'skip vibe',
    'next',
    'done',
    'pass',
    'none',
    'nope',
    'SKIP',
    'no vibe',
  ])('classifies %o as an explicit skip', (input) => {
    expect(classifyVibeInput(input)).toBe('skip');
  });

  // ── Tail speech / other-step data → reprompt, never captured ───────
  it.each([
    'their email is john@acme.com',
    'john@acme.com',
    'their website is acme.com',
    'https://acme.com',
    'www.acme.com',
    'call them at (555) 123-4567',
    '5551234567',
    'category retail',
    'category retail fun and playful', // field+vibe merge is ambiguous → restate
    'the industry is healthcare',
    'name is Acme Corp',
    'create client Acme',
  ])('classifies %o as bleed from another step', (input) => {
    expect(classifyVibeInput(input)).toBe('bleed');
  });

  // ── Hesitations / bare acknowledgements → reprompt ─────────────────
  it.each([
    'um',
    'uh',
    'hmm',
    'okay',
    'yeah',
    'sure',
    'well',
    '...',
    'whatever',
    'idk',
    'hold on',
  ])('classifies %o as a hesitation', (input) => {
    expect(classifyVibeInput(input)).toBe('filler');
  });

  // ── Deliberate vibe answers → captured ─────────────────────────────
  it.each([
    'fun and playful',
    'bold, modern and trustworthy',
    'friendly neighborhood shop',
    'professional yet approachable',
    'vibrant and energetic',
  ])('classifies %o as a deliberate vibe', (input) => {
    expect(classifyVibeInput(input)).toBe('vibe');
  });

  // ── A vibe that merely contains a skip-ish word is still a vibe ────
  it('does not treat a vibe sentence containing "skip" as a skip signal', () => {
    expect(classifyVibeInput('skip the formal tone, keep it casual')).toBe('vibe');
  });

  // ── Category restatement → ambiguous, never auto-captured ──────────
  it('rejects a category restatement (even one merged with vibe-like text)', () => {
    expect(classifyVibeInput('category retail')).toBe('bleed');
    expect(classifyVibeInput('category retail fun and playful')).toBe('bleed');
  });

  it('exposes a minimum vibe length above empty/whitespace', () => {
    expect(MIN_VIBE_LENGTH).toBeGreaterThanOrEqual(3);
  });
});
