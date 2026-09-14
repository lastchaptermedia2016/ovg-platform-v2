import { describe, it, expect } from 'vitest';
import {
  classifyAuthError,
  isNetworkError,
  type AuthFlowError,
} from './auth-errors';

describe('isNetworkError', () => {
  it('returns true for a TypeError("Failed to fetch")', () => {
    expect(isNetworkError(new TypeError('Failed to fetch'))).toBe(true);
  });

  it('returns true for a TypeError with mixed-case message', () => {
    expect(isNetworkError(new TypeError('failed to fetch'))).toBe(true);
  });

  it('returns false for a generic Error even if the message mentions fetch', () => {
    expect(isNetworkError(new Error('Failed to fetch'))).toBe(false);
  });

  it('returns false for null, undefined and primitives', () => {
    expect(isNetworkError(null)).toBe(false);
    expect(isNetworkError(undefined)).toBe(false);
    expect(isNetworkError(123)).toBe(false);
    expect(isNetworkError('Failed to fetch')).toBe(false);
  });

  it('returns false for a Supabase-style error object', () => {
    expect(
      isNetworkError({ message: 'Invalid login credentials', code: 'invalid_credentials' }),
    ).toBe(false);
  });
});

describe('classifyAuthError', () => {
  it('classifies a TypeError("Failed to fetch") as a network error', () => {
    const result: AuthFlowError = classifyAuthError(new TypeError('Failed to fetch'));
    expect(result.isNetwork).toBe(true);
    expect(result.message).toMatch(/Unable to reach the authentication service/);
  });

  it('passes through a Supabase domain error message', () => {
    const supabaseError = {
      message: 'Invalid login credentials',
      code: 'invalid_credentials',
      status: 400,
    };
    const result = classifyAuthError(supabaseError);
    expect(result.isNetwork).toBe(false);
    expect(result.message).toBe('Invalid login credentials');
  });

  it('passes through a thrown Error message', () => {
    const result = classifyAuthError(new Error('Email already registered'));
    expect(result.isNetwork).toBe(false);
    expect(result.message).toBe('Email already registered');
  });

  it('returns a fallback message for null/undefined/primitives', () => {
    const expected = 'An unexpected error occurred. Please try again.';
    expect(classifyAuthError(null).message).toBe(expected);
    expect(classifyAuthError(undefined).message).toBe(expected);
    expect(classifyAuthError(0).message).toBe(expected);
  });

  it('passes through a plain string error', () => {
    const result = classifyAuthError('Bad credentials');
    expect(result.isNetwork).toBe(false);
    expect(result.message).toBe('Bad credentials');
  });
});
