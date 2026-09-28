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
 * Serialize an arbitrary throwable into a loggable shape (handles Error,
 * DOMException-like objects, plain objects, strings, and primitives).
 */
export function describeSttError(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    return {
      errorType: err.name,
      errorMessage: err.message,
      errorStack: err.stack?.split('\n').slice(0, 2).join(' '),
    };
  }
  if (typeof err === 'object' && err !== null) {
    const errObj = err as Record<string, unknown>;
    const objMessage = errObj.message ?? errObj.toString?.() ?? 'Unknown';
    return {
      errorType: errObj.constructor?.name ?? 'Unknown',
      errorMessage: objMessage,
      errorName: errObj.name,
    };
  }
  if (typeof err === 'string') {
    return { errorType: 'string', errorMessage: err };
  }
  return { errorType: typeof err, errorMessage: String(err) };
}
