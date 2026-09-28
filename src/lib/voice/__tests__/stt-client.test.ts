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
  it('serializes Error instances with a truncated stack', () => {
    const described = describeSttError(new Error('boom'));
    expect(described.errorType).toBe('Error');
    expect(described.errorMessage).toBe('boom');
    expect(described.errorStack).toBeDefined();
  });

  it('serializes DOMException-like objects by constructor name', () => {
    const domExceptionLike = {
      name: 'EncodingError',
      message: 'unable to decode',
      constructor: { name: 'DOMException' },
    };
    const described = describeSttError(domExceptionLike);
    expect(described.errorMessage).toBe('unable to decode');
    expect(described.errorName).toBe('EncodingError');
  });

  it('serializes plain strings', () => {
    expect(describeSttError('plain failure')).toEqual({
      errorType: 'string',
      errorMessage: 'plain failure',
    });
  });

  it('serializes primitive non-strings', () => {
    expect(describeSttError(42)).toEqual({ errorType: 'number', errorMessage: '42' });
  });
});
