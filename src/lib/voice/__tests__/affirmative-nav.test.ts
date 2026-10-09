// src/lib/voice/__tests__/affirmative-nav.test.ts
//
// Node-only vitest: affirmative-nav is a pure leaf module (no DOM, no React).
// These tests lock in the two-predicate contract the voice hook depends on to
// resolve a navigational follow-up locally instead of dead-ending at CLIENT_NOP.

import { describe, it, expect } from 'vitest';
import {
  isAffirmativeUtterance,
  isNavigationOffer,
  APPOINTMENTS_HREF,
} from '../affirmative-nav';

describe('isAffirmativeUtterance', () => {
  it('accepts bare affirmatives (the "Yes, please." follow-up)', () => {
    for (const phrase of [
      'yes',
      'Yes.',
      'yes please',
      'Yes, please.',
      'sure',
      'yeah',
      'yep',
      'yup',
      'okay',
      'ok',
      'please',
      'go ahead',
      'take me there',
      'do it',
      'sounds good',
    ]) {
      expect(isAffirmativeUtterance(phrase), phrase).toBe(true);
    }
  });

  it('rejects compound utterances so they fall through to the backend', () => {
    for (const phrase of [
      'yes and also update my branding',
      'yes please thanks',
      'sure, book me an appointment',
      'no',
      'maybe later',
      'tell me about the weather',
      '',
    ]) {
      expect(isAffirmativeUtterance(phrase), phrase).toBe(false);
    }
  });

  it('tolerates surrounding whitespace and trailing punctuation', () => {
    expect(isAffirmativeUtterance('  yes!  ')).toBe(true);
    expect(isAffirmativeUtterance('  take me there.  ')).toBe(true);
  });
});

describe('isNavigationOffer', () => {
  it('detects an offer to navigate (arms the local pending target)', () => {
    expect(
      isNavigationOffer(
        'Sure, you have 3 appointments: 1 new, 1 contacted, 1 archived. Would you like me to take you there to review them?',
      ),
    ).toBe(true);
    expect(isNavigationOffer('Want me to take you there?')).toBe(true);
  });

  it('does NOT treat a navigation confirmation as a new offer', () => {
    // "Taking you straight to …" is the post-navigation summary — arming on it
    // would let a later stray "yes" re-fire a stale navigation.
    expect(isNavigationOffer('On it! Taking you straight to Appointment Requests.')).toBe(false);
    expect(isNavigationOffer('On it! Taking you there now.')).toBe(false);
  });

  it('returns false for null/undefined/empty summaries', () => {
    expect(isNavigationOffer(null)).toBe(false);
    expect(isNavigationOffer(undefined)).toBe(false);
    expect(isNavigationOffer('')).toBe(false);
  });
});

describe('APPOINTMENTS_HREF', () => {
  it('is the client appointments dashboard path', () => {
    expect(APPOINTMENTS_HREF).toBe('/client/dashboard/appointments');
  });
});
