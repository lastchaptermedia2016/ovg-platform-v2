// src/lib/ai/__tests__/conversational-voice.test.ts
//
// Deterministic suite for the public widget contact-parsing helpers in
// ../conversational-voice.ts. Pure functions, no mocks needed.

import { describe, it, expect } from 'vitest';
import { parseVisitorContact, hasContactDetails } from '../conversational-voice';

describe('parseVisitorContact', () => {
  it('parses "Peter, 8897897890" into name + canonical phone', () => {
    const result = parseVisitorContact('Peter, 8897897890');
    expect(result.name).toBe('Peter');
    expect(result.phone).toBe('8897897890');
  });

  it('parses "It is Sarah — 0825551212" with an em-dash separator', () => {
    const result = parseVisitorContact('It is Sarah — 0825551212');
    expect(result.name).toBe('It is Sarah');
    expect(result.phone).toBe('0825551212');
  });

  it('strips a leading + and formatting from international numbers', () => {
    const result = parseVisitorContact('Call me at +27 82 123 4567 please');
    expect(result.phone).toBe('27821234567');
    // "Call me at ..." is a non-name cue, so the name is dropped — the lead
    // still captures the phone, which is what the dashboard groups by.
    expect(result.name).toBe(null);
  });

  it('handles dashes, dots, and parentheses', () => {
    const result = parseVisitorContact('John — (031) 123-4567');
    expect(result.name).toBe('John');
    expect(result.phone).toBe('0311234567');
  });

  it('returns nulls when no phone is present', () => {
    const result = parseVisitorContact('hello what are your hours');
    expect(result.name).toBe(null);
    expect(result.phone).toBe(null);
  });

  it('rejects short digit strings (below 7 digits) as not a phone', () => {
    const result = parseVisitorContact('my pin is 1234');
    expect(result.name).toBe(null);
    expect(result.phone).toBe(null);
  });

  it('rejects the intake script itself (no name, no phone)', () => {
    const script =
      "I can get that scheduled for you right away! What is your name and the best phone number to reach you on, and I'll have our team lock in your slot immediately.";
    const result = parseVisitorContact(script);
    expect(result.phone).toBe(null);
    expect(result.name).toBe(null);
  });

  it('returns name-only when a name is present but no phone', () => {
    const result = parseVisitorContact('my name is Thabo');
    expect(result.name).toBe(null); // heuristic: no phone => no lead
    expect(result.phone).toBe(null);
  });

  it('handles empty / null input safely', () => {
    expect(parseVisitorContact('')).toEqual({ name: null, phone: null });
    expect(parseVisitorContact('   ')).toEqual({ name: null, phone: null });
  });

  it('extracts the first phone match when multiple numbers are present', () => {
    const result = parseVisitorContact('Reach 082 111 2222 or 031 333 4444');
    expect(result.phone).toBe('0821112222');
  });
});

describe('hasContactDetails', () => {
  it('returns true when the message carries a phone', () => {
    expect(hasContactDetails('Sarah, 0825551212')).toBe(true);
  });

  it('returns false when the message carries no phone', () => {
    expect(hasContactDetails('just saying hi')).toBe(false);
  });
});