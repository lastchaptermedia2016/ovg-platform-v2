/**
 * Universal Voice Entry — Parser Verification Suite (Vitest)
 *
 * Strict, modern Vitest standards: explicit imports, single flattened suite
 * architecture, and `expect`-based assertions throughout.
 */

import { describe, it, expect } from 'vitest';
import { parseVoiceEntry } from '../parse-voice-entry';

// ─── Universal Flattened Suite ───────────────────────────────────

describe('Universal Voice Entry Engine Suite', () => {
  // ── Delimiter Parse Tests (Phase 1) ────────────────────────────

  it('extracts name and industry from pipe-delimited input', () => {
    const result = parseVoiceEntry('Acme Motors | automotive');
    expect(result).toEqual({
      name: 'Acme Motors',
      industry: 'automotive',
      category: 'AUTOMOTIVE_ELITE',
      meta: { parserFoundDelimiters: true, confidence: 1.0 as const },
    });
  });

  it('extracts name and industry from comma-delimited input', () => {
    const result = parseVoiceEntry("Joe's Diner, restaurant");
    expect(result).toEqual({
      name: "Joe's Diner",
      industry: 'restaurant',
      category: 'RETAIL_STANDARD',
      meta: { parserFoundDelimiters: true, confidence: 1.0 as const },
    });
  });

  it('extracts name and industry from semicolon-delimited input', () => {
    const result = parseVoiceEntry('GreenTech Auto; electric vehicles');
    expect(result).toEqual({
      name: 'GreenTech Auto',
      industry: 'electric vehicles',
      category: 'AUTOMOTIVE_ELITE',
      meta: { parserFoundDelimiters: true, confidence: 1.0 as const },
    });
  });

  it('defaults to GENERAL category when industry is unrecognized', () => {
    const result = parseVoiceEntry('Blue Ocean | consulting');
    expect(result).toEqual({
      name: 'Blue Ocean',
      industry: 'consulting',
      category: 'GENERAL',
      meta: { parserFoundDelimiters: true, confidence: 0.8 as const },
    });
  });

  it('handles whitespace around delimiter segments', () => {
    const result = parseVoiceEntry('  Bobs Garage  |  automotive  ');
    expect(result).toEqual({
      name: 'Bobs Garage',
      industry: 'automotive',
      category: 'AUTOMOTIVE_ELITE',
      meta: { parserFoundDelimiters: true, confidence: 1.0 as const },
    });
  });

  it('returns only name when delimiter has no industry segment', () => {
    const result = parseVoiceEntry('Solo Shop,');
    expect(result).toEqual({
      name: 'Solo Shop',
      industry: 'GENERAL',
      category: 'GENERAL',
      meta: { parserFoundDelimiters: true, confidence: 0.8 as const },
    });
  });

  // ── Regex Pattern Match Tests (Phase 2) ────────────────────────

  it('parses "create client X in industry Y" pattern', () => {
    const result = parseVoiceEntry("create new client Bob's Garage in automotive");
    expect(result.name).toBe("Bob's Garage");
    expect(result.industry).toBe('automotive');
    expect(result.category).toBe('AUTOMOTIVE_ELITE');
    expect(result.meta.parserFoundDelimiters).toBe(false);
    expect(result.meta.confidence).toBe(0.5);
  });

  it('parses "add client X for industry Y" pattern', () => {
    // Requires a "client"/"business" keyword to disambiguate "add"
    const result = parseVoiceEntry('add client Bright Ideas Boutique for retail');
    expect(result.name).toBe('Bright Ideas Boutique');
    expect(result.industry).toBe('retail');
    expect(result.category).toBe('RETAIL_STANDARD');
    expect(result.meta.parserFoundDelimiters).toBe(false);
    expect(result.meta.confidence).toBe(0.5);
  });

  it('parses "X for Y" short pattern with known industry keyword even without entity keyword', () => {
    // "retail" is a known industry keyword in the short pattern, so the parser
    // correctly identifies it as an industry even without "client" prefix.
    const result = parseVoiceEntry('add Bright Ideas Boutique for retail');
    expect(result.name).toBe('add Bright Ideas Boutique');
    expect(result.industry).toBe('retail');
    expect(result.category).toBe('RETAIL_STANDARD');
    expect(result.meta.parserFoundDelimiters).toBe(false);
    expect(result.meta.confidence).toBe(0.5);
  });

  it('falls back to name-only when short pattern does not match known industry', () => {
    // "consulting" is NOT in the known industry keyword list, so the parser
    // falls to Phase 3 (full-string fallback).
    const result = parseVoiceEntry('add Swift Consulting for consulting');
    expect(result.name).toBe('add Swift Consulting for consulting');
    expect(result.industry).toBe('GENERAL');
    expect(result.category).toBe('GENERAL');
    expect(result.meta.confidence).toBe(0.1);
  });

  it('parses "X in Y" short pattern with known industry keyword', () => {
    const result = parseVoiceEntry('Steve Auto in automotive industry');
    expect(result.name).toBe('Steve Auto');
    expect(result.industry).toBe('automotive');
    expect(result.category).toBe('AUTOMOTIVE_ELITE');
  });

  it('parses "X — Y" hyphen pattern', () => {
    const result = parseVoiceEntry('Best Cafe — restaurant');
    expect(result.name).toBe('Best Cafe');
    expect(result.industry).toBe('restaurant');
    expect(result.category).toBe('RETAIL_STANDARD');
  });

  it('parses "X - Y" en-dash pattern', () => {
    const result = parseVoiceEntry('Best Cafe – bakery');
    expect(result.name).toBe('Best Cafe');
    expect(result.industry).toBe('bakery');
    expect(result.category).toBe('RETAIL_STANDARD');
  });

  it('defaults category to GENERAL when industry is not found in map', () => {
    const result = parseVoiceEntry('create client Big Corp in manufacturing');
    expect(result.name).toBe('Big Corp');
    expect(result.industry).toBe('manufacturing');
    expect(result.category).toBe('GENERAL');
    expect(result.meta.confidence).toBe(0.3);
  });

  // ── Full-String Fallback Tests (Phase 3) ───────────────────────

  it('returns the entire string as name for conversational noise', () => {
    const result = parseVoiceEntry('Hannah is asking the correct questions');
    expect(result).toEqual({
      name: 'Hannah is asking the correct questions',
      industry: 'GENERAL',
      category: 'GENERAL',
      meta: { parserFoundDelimiters: false, confidence: 0.1 as const },
    });
  });

  it('returns the entire string as name for arbitrary text', () => {
    const result = parseVoiceEntry('I think we should schedule a meeting for next week');
    expect(result.name).toBe('I think we should schedule a meeting for next week');
    expect(result.category).toBe('GENERAL');
    expect(result.meta.confidence).toBe(0.1);
  });

  it('returns empty name for empty input', () => {
    const result = parseVoiceEntry('');
    expect(result).toEqual({
      name: '',
      industry: 'GENERAL',
      category: 'GENERAL',
      meta: { parserFoundDelimiters: false, confidence: 0 as const },
    });
  });

  it('returns empty name for whitespace-only input', () => {
    const result = parseVoiceEntry('   ');
    expect(result.name).toBe('');
    expect(result.meta.confidence).toBe(0);
  });

  // ── Integration / Regression Tests ─────────────────────────────

  it('maps "automotive" industry to AUTOMOTIVE_ELITE', () => {
    expect(parseVoiceEntry('Test | automotive').category).toBe('AUTOMOTIVE_ELITE');
  });

  it('maps "retail" industry to RETAIL_STANDARD', () => {
    expect(parseVoiceEntry('Test | retail').category).toBe('RETAIL_STANDARD');
  });

  it('maps unknown industry to GENERAL', () => {
    expect(parseVoiceEntry('Test | agriculture').category).toBe('GENERAL');
  });

  it('is case-insensitive for industry matching', () => {
    expect(parseVoiceEntry('Test | AutoMotivE').category).toBe('AUTOMOTIVE_ELITE');
    expect(parseVoiceEntry('Test | RETAIL').category).toBe('RETAIL_STANDARD');
  });

  it('prefers delimiter parse over regex when both could match', () => {
    const result = parseVoiceEntry('create client X | automotive');
    expect(result.meta.parserFoundDelimiters).toBe(true);
    expect(result.name).toBe('create client X');
    expect(result.category).toBe('AUTOMOTIVE_ELITE');
    expect(result.meta.confidence).toBe(1.0);
  });
});