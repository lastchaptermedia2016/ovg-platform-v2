// src/lib/voice/__tests__/stt-client.test.ts
//
// Phase 5 — STT request contract (file + tenantId FormData) and the
// deterministic primary → Web Speech fallback orchestration, testable under
// Node-only vitest with an injected fetch.

import { describe, it, expect, vi } from 'vitest';
import {
  requestClientTranscription,
  transcribeWithFallback,
  describeSttError,
} from '../stt-client';
import { TranscodeError } from '../transcoder';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const audioBlob = () => new Blob([new Uint8Array(32)], { type: 'audio/wav' });

describe('requestClientTranscription', () => {
  it('POSTs file + tenantId FormData to /api/client/stt and returns trimmed text', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ text: '  hello  ' }));
    const text = await requestClientTranscription({
      blob: audioBlob(),
      tenantId: 'tenant-uuid-1',
      fetchFn: fetchMock as unknown as typeof fetch,
    });

    expect(text).toBe('hello');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/client/stt');
    expect(init.method).toBe('POST');
    expect(init.body).toBeInstanceOf(FormData);

    const form = init.body as FormData;
    expect(form.get('tenantId')).toBe('tenant-uuid-1');
    expect(form.get('file')).not.toBeNull();
  });

  it('omits the tenantId field when none is supplied', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ text: 'x' }));
    await requestClientTranscription({
      blob: audioBlob(),
      fetchFn: fetchMock as unknown as typeof fetch,
    });

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.body as FormData).get('tenantId')).toBeNull();
  });

  it('throws the server error message on non-OK responses (e.g. 429)', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ error: 'Too many requests' }, 429));
    await expect(
      requestClientTranscription({ blob: audioBlob(), fetchFn: fetchMock as unknown as typeof fetch }),
    ).rejects.toThrow('Too many requests');
  });

  it('throws a status message when the error body is not JSON', async () => {
    const fetchMock = vi.fn(async () => new Response('bad gateway', { status: 502 }));
    await expect(
      requestClientTranscription({ blob: audioBlob(), fetchFn: fetchMock as unknown as typeof fetch }),
    ).rejects.toThrow('STT failed with status 502');
  });

  it('returns an empty string when the response omits text', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}));
    const text = await requestClientTranscription({
      blob: audioBlob(),
      fetchFn: fetchMock as unknown as typeof fetch,
    });
    expect(text).toBe('');
  });
});

describe('transcribeWithFallback', () => {
  it('resolves primary text without invoking the fallback', async () => {
    const onFallback = vi.fn();
    const result = await transcribeWithFallback(async () => 'command received', onFallback);

    expect(result).toEqual({ text: 'command received', fellBack: false });
    expect(onFallback).not.toHaveBeenCalled();
  });

  it('triggers the Web Speech fallback when the primary STT throws', async () => {
    const onFallback = vi.fn();
    const primaryError = new Error('network timeout talking to Whisper');
    const result = await transcribeWithFallback(
      () => Promise.reject(primaryError),
      onFallback,
    );

    expect(result).toEqual({ text: '', fellBack: true });
    expect(onFallback).toHaveBeenCalledTimes(1);
    expect(onFallback).toHaveBeenCalledWith(primaryError);
  });

  it('still resolves when the fallback handler itself throws', async () => {
    const onFallback = vi.fn(() => {
      throw new Error('speech recognition unavailable');
    });
    const result = await transcribeWithFallback(
      () => Promise.reject(new Error('primary down')),
      onFallback,
    );

    expect(result).toEqual({ text: '', fellBack: true });
    expect(onFallback).toHaveBeenCalledTimes(1);
  });
});

describe('describeSttError', () => {
  it('extracts name/message/stack from Error instances', () => {
    const described = describeSttError(new Error('boom'));

    expect(described.name).toBe('Error');
    expect(described.message).toBe('boom');
    expect(typeof described.stack).toBe('string');
    expect(described.stack).toBeDefined();
    expect(described.stack as string).not.toBe('');
  });

  it('includes the TranscodeError code for transcode failures', () => {
    const described = describeSttError(new TranscodeError('EMPTY', 'no audio frames'));

    expect(described.name).toBe('TranscodeError');
    expect(described.message).toBe('no audio frames');
    expect(described.code).toBe('EMPTY');
    expect(typeof described.stack).toBe('string');
  });

  it('omits code for a plain Error (no undefined noise keys)', () => {
    const described = describeSttError(new Error('boom'));

    expect('code' in described).toBe(false);
  });

  it('stringifies a DOMException-like plain object under rawError', () => {
    const domExceptionLike = {
      name: 'EncodingError',
      message: 'unable to decode',
      toString() {
        return 'EncodingError: unable to decode';
      },
    };
    const described = describeSttError(domExceptionLike);

    expect(described).toEqual({ rawError: 'EncodingError: unable to decode' });
    expect(Object.keys(described)).not.toHaveLength(0);
    expect(typeof described.rawError).toBe('string');
    expect(described.rawError as string).not.toBe('');
  });

  it('stringifies a bare object literal without toString', () => {
    const described = describeSttError({ name: 'EncodingError', message: 'unable to decode' });

    expect(Object.keys(described)).toHaveLength(1);
    expect(typeof described.rawError).toBe('string');
    expect(described.rawError as string).not.toBe('');
  });

  it('serializes plain strings', () => {
    expect(describeSttError('plain failure')).toEqual({ rawError: 'plain failure' });
  });

  it('serializes primitive non-strings', () => {
    expect(describeSttError(42)).toEqual({ rawError: '42' });
  });

  it('never returns an empty object for any throwable (regression guard for {})', () => {
    const throwables: unknown[] = [
      new Error('boom'),
      new TypeError('bad type'),
      new TranscodeError('EMPTY', 'no audio frames'),
      { name: 'EncodingError', message: 'unable to decode' },
      { toString: () => 'EncodingError: unable to decode' },
      'plain failure',
      42,
      null,
      undefined,
      Symbol('sym'),
      [],
    ];

    for (const throwable of throwables) {
      const described = describeSttError(throwable);
      const keys = Object.keys(described);

      expect(keys.length, `empty description for ${String(throwable)}`).toBeGreaterThan(0);
      expect(described).not.toEqual({});
      for (const key of keys) {
        expect(
          Object.getOwnPropertyDescriptor(described, key)?.enumerable,
          `key ${key} must be enumerable`,
        ).toBe(true);
      }
    }
  });
});
