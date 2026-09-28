/**
 * Client-surface Speech-to-Text request + fallback orchestration (Phase 5).
 *
 * Extracted from `useZeederVoice` so both halves are pure and injectable:
 *   - `requestClientTranscription` owns the FormData contract with
 *     `/api/client/stt` (file + optional tenantId for session tracking).
 *   - `transcribeWithFallback` owns the deterministic primary→fallback
 *     handoff, making "fallback triggers when primary throws" testable
 *     under Node-only Vitest (no jsdom/hook rendering required).
 *   - `describeSttError` serializes arbitrary throwables for diagnostics.
 *
 * Client (Zeeder) surface only. Does NOT import reseller-domain code.
 */

import { TranscodeError } from './transcoder';

/** Options for {@link requestClientTranscription}. */
export interface RequestClientTranscriptionOptions {
  /** Transcoded audio (canonical WAV) to upload. */
  blob: Blob;
  /**
   * Optional active tenant id. Session-tracking ONLY — the server resolves
   * the authoritative tenant from the session and never trusts this value.
   */
  tenantId?: string;
  /** Upload filename (defaults to `recording.wav`). */
  filename?: string;
  /** Injectable fetch for tests; defaults to the global fetch. */
  fetchFn?: typeof fetch;
}

/** Outcome of a primary-with-fallback transcription attempt. */
export interface TranscriptionOutcome {
  /** Transcript from the primary path; empty string when falling back. */
  text: string;
  /** True when the primary path threw and the fallback handler ran. */
  fellBack: boolean;
}

/**
 * POST an audio blob to `/api/client/stt` and return the trimmed transcript.
 *
 * @throws {Error} on any non-OK response (server `error` message when
 *   available) so callers can route the failure into their fallback.
 */
export async function requestClientTranscription(
  options: RequestClientTranscriptionOptions,
): Promise<string> {
  const { blob, tenantId, filename = 'recording.wav', fetchFn } = options;
  const doFetch =
    fetchFn ?? ((input: RequestInfo | URL, init?: RequestInit) => globalThis.fetch(input, init));

  const form = new FormData();
  form.append('file', blob, filename);
  if (tenantId) form.append('tenantId', tenantId);

  const res = await doFetch('/api/client/stt', { method: 'POST', body: form });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `STT failed with status ${res.status}`);
  }
  const data = (await res.json()) as { text?: string };
  return data.text?.trim() ?? '';
}

/**
 * Run the primary transcription path; on ANY failure invoke `onFallback`
 * with the caught error and resolve with an empty transcript.
 *
 * The fallback handler is itself guarded — a throwing handler can never
 * reject the orchestration (graceful degradation requirement).
 */
export async function transcribeWithFallback(
  primary: () => Promise<string>,
  onFallback: (error: unknown) => void,
): Promise<TranscriptionOutcome> {
  try {
    const text = await primary();
    return { text, fellBack: false };
  } catch (err) {
    try {
      onFallback(err);
    } catch {
      // A faulty fallback handler must not break the recording flow.
    }
    return { text: '', fellBack: true };
  }
}

/**
 * Serialize an arbitrary throwable into a loggable shape.
 *
 * The result is ALWAYS a plain, fully-enumerable object with at least one
 * key, so it is safe to hand straight to `console.error(..., describeSttError(err))`
 * or to spread into a log payload (`{ ...describeSttError(err), stage }`) without
 * the payload collapsing to `{}`.
 *
 * This matters because spreading or serializing a thrown `Error`/`DOMException`
 * is exactly what loses the data: `name`, `message`, `stack` (and a
 * `TranscodeError`'s `code`) are non-enumerable, so a naive spread yields an
 * empty object. They are therefore extracted explicitly.
 *
 * `Error` instances contribute `name`/`message`/`stack`, plus `code` when the
 * throwable is a `TranscodeError`. Any OTHER throwable (DOMException-like
 * plain objects, strings, numbers, symbols, …) is stringified into `rawError`,
 * which is what guarantees the log is never `{}`.
 */
export function describeSttError(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message,
      stack: err.stack,
      ...(err instanceof TranscodeError ? { code: err.code } : {}),
    };
  }
  return { rawError: String(err) };
}
