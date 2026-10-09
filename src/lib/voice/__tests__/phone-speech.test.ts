// src/lib/voice/__tests__/phone-speech.test.ts
//
// Node-only vitest: phone-speech is a pure leaf module (no DOM, no AudioContext,
// no React), so it needs neither jsdom nor Web Audio. These tests lock in the
// spoken-vs-visual contract the widget's TTS path depends on.

import { describe, it, expect } from 'vitest';
import { formatPhoneForSpeech } from '../phone-speech';

describe('formatPhoneForSpeech', () => {
  it('groups a plain 11-digit phone into spaced blocks', () => {
    // Default widget phone "27760330046" — read as one number by a raw TTS engine.
    expect(formatPhoneForSpeech('27760330046')).toBe('277 603 300 46');
  });

  it('groups a local 10-digit phone and merges a trailing lone digit', () => {
    // "0831234567" would naively group as "083 123 456 7"; the trailing single
    // digit must merge into the previous block → "083 123 4567".
    expect(formatPhoneForSpeech('0831234567')).toBe('083 123 4567');
  });

  it('preserves a leading + and re-spaces an already-formatted number', () => {
    // +27 (82) 123-4567 → digits 27821234567 → 278 212 345 67 (leading + kept).
    expect(formatPhoneForSpeech('+27 (82) 123-4567')).toBe('+278 212 345 67');
  });

  it('reformats phone-like tokens embedded in prose, leaving words intact', () => {
    expect(
      formatPhoneForSpeech('Your number is 27760330046. See you soon!'),
    ).toBe('Your number is 277 603 300 46. See you soon!');
  });

  it('leaves non-phone short numbers and text untouched', () => {
    // Out of the 7–15 phone range, or no digits at all.
    expect(formatPhoneForSpeech('2024')).toBe('2024');
    expect(formatPhoneForSpeech('Order 12345 ready')).toBe('Order 12345 ready');
    expect(formatPhoneForSpeech('No phone here.')).toBe('No phone here.');
  });

  it('returns empty/falsy input unchanged', () => {
    expect(formatPhoneForSpeech('')).toBe('');
  });
});
