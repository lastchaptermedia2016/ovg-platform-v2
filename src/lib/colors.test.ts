import { describe, it, expect } from 'vitest';
import { normalizeHexColor, isValidHexColor } from './colors';

describe('normalizeHexColor', () => {
  it('maps CSS color names to hex', () => {
    expect(normalizeHexColor('red')).toBe('#ff0000');
    expect(normalizeHexColor('RebeccaPurple')).toBe('#663399');
    expect(normalizeHexColor('  BLUE ')).toBe('#0000ff');
  });

  it('expands 3-digit hex to 6-digit', () => {
    expect(normalizeHexColor('#f00')).toBe('#ff0000');
    expect(normalizeHexColor('#1A7')).toBe('#11aa77');
  });

  it('preserves valid 6/8-digit hex', () => {
    expect(normalizeHexColor('#1A73E8')).toBe('#1a73e8');
    expect(normalizeHexColor('#1A73E8FF')).toBe('#1a73e8ff');
  });

  it('leaves background-only values unchanged', () => {
    expect(normalizeHexColor('linear-gradient(135deg, #ff0000, #0000ff)')).toBe(
      'linear-gradient(135deg, #ff0000, #0000ff)'
    );
    expect(normalizeHexColor('rgba(255,0,0,0.5)')).toBe('rgba(255,0,0,0.5)');
    expect(normalizeHexColor('none')).toBe('none');
    expect(normalizeHexColor('transparent')).toBe('transparent');
    expect(normalizeHexColor('url(https://x/y.png)')).toBe('url(https://x/y.png)');
  });

  it('returns unknown color names unchanged', () => {
    expect(normalizeHexColor('notacolor')).toBe('notacolor');
  });
});

describe('isValidHexColor', () => {
  it('accepts #rrggbb and rejects named colors', () => {
    expect(isValidHexColor('#ff0000')).toBe(true);
    expect(isValidHexColor('red')).toBe(false);
    expect(isValidHexColor('linear-gradient(...)')).toBe(false);
  });
});
