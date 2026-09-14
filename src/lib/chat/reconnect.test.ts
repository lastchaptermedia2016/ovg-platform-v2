import { describe, it, expect } from 'vitest';
import { computeReconnectDelay } from './reconnect';

describe('computeReconnectDelay', () => {
  const BASE = 1000;
  const MAX = 30000;

  it('starts at the base delay for attempt 0', () => {
    expect(computeReconnectDelay(0, BASE, MAX)).toBe(BASE);
  });

  it('grows exponentially (base * 2 ** attempt)', () => {
    expect(computeReconnectDelay(1, BASE, MAX)).toBe(BASE * 2);
    expect(computeReconnectDelay(2, BASE, MAX)).toBe(BASE * 4);
    expect(computeReconnectDelay(3, BASE, MAX)).toBe(BASE * 8);
    expect(computeReconnectDelay(4, BASE, MAX)).toBe(BASE * 16);
  });

  it('caps at maxDelay once the exponent exceeds the cap', () => {
    // base * 2 ** 5 = 32000 -> capped to 30000
    expect(computeReconnectDelay(5, BASE, MAX)).toBe(MAX);
    expect(computeReconnectDelay(10, BASE, MAX)).toBe(MAX);
    expect(computeReconnectDelay(50, BASE, MAX)).toBe(MAX);
  });

  it('never returns below the base delay', () => {
    expect(computeReconnectDelay(0, BASE, MAX)).toBe(BASE);
  });

  it('treats a negative attempt as 0', () => {
    expect(computeReconnectDelay(-1, BASE, MAX)).toBe(BASE);
  });

  it('matches the original inline formula Math.min(base * 2 ** attempt, max)', () => {
    for (let a = 0; a <= 8; a++) {
      expect(computeReconnectDelay(a, BASE, MAX)).toBe(Math.min(BASE * 2 ** a, MAX));
    }
  });
});
