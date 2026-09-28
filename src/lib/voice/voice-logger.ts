/**
 * Web Voice Session Logger (Phase 5)
 *
 * Writes completed/failed server-side STT sessions to `tenant_voice_sessions`.
 *
 * Guarantees:
 *   - Strict multi-tenant scoping: a session is NEVER inserted without a
 *     valid tenant UUID (orphan-record prevention), and validation happens
 *     BEFORE any database call.
 *   - Never throws: Postgrest failures and invalid input resolve to
 *     `{ error }`, so logging can never break the response path it guards.
 *
 * Payload fields mirror the table columns 1:1 (camelCase → snake_case at
 * the insert boundary).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase/admin';

/** Speech-to-text engine that produced the transcript. */
export type SttProvider = 'whisper' | 'web-speech';

/** Terminal (or mid-session) state of a voice session. */
export type VoiceSessionStatus = 'completed' | 'fallback' | 'failed';

export interface VoiceSessionPayload {
  /** Tenant UUID (FK → tenants.id). Required; validated before any DB call. */
  tenantId: string;
  /** Correlation id for the STT session (server-generated UUID). */
  sessionId: string;
  /** Estimated clip duration in ms (null when not derivable, e.g. non-WAV). */
  audioDurationMs?: number | null;
  sttProvider: SttProvider;
  /** Final transcript (null on failure). */
  transcript?: string | null;
  /** Measured STT round-trip latency in ms. */
  latencyMs: number;
  status: VoiceSessionStatus;
}

/** Result union — mirrors the knowledge engine's never-throw contract. */
export interface VoiceSessionLogResult {
  error: string | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const STT_PROVIDERS: readonly SttProvider[] = ['whisper', 'web-speech'];
const SESSION_STATUSES: readonly VoiceSessionStatus[] = ['completed', 'fallback', 'failed'];

/**
 * Validate a session payload. Returns an error string when the payload
 * must be rejected, or `null` when it is safe to persist.
 * Exported for direct unit testing of the orphan-prevention guarantee.
 */
export function validateVoiceSessionPayload(payload: VoiceSessionPayload): string | null {
  if (!payload || typeof payload.tenantId !== 'string' || !UUID_RE.test(payload.tenantId.trim())) {
    return 'tenantId is required and must be a valid UUID';
  }
  if (typeof payload.sessionId !== 'string' || payload.sessionId.trim() === '') {
    return 'sessionId is required';
  }
  if (!STT_PROVIDERS.includes(payload.sttProvider)) {
    return `sttProvider must be one of: ${STT_PROVIDERS.join(', ')}`;
  }
  if (!SESSION_STATUSES.includes(payload.status)) {
    return `status must be one of: ${SESSION_STATUSES.join(', ')}`;
  }
  if (!Number.isInteger(payload.latencyMs) || payload.latencyMs < 0) {
    return 'latencyMs must be a non-negative integer';
  }
  if (
    payload.audioDurationMs !== undefined &&
    payload.audioDurationMs !== null &&
    (!Number.isInteger(payload.audioDurationMs) || payload.audioDurationMs < 0)
  ) {
    return 'audioDurationMs must be a non-negative integer when provided';
  }
  return null;
}

/**
 * Persist one voice session row, strictly scoped to `tenantId`.
 *
 * @returns `{ error: null }` on success; a descriptive error otherwise.
 *   Never throws and never issues a DB call for an invalid payload.
 */
export async function logVoiceSession(
  payload: VoiceSessionPayload,
  client: SupabaseClient = supabaseAdmin,
): Promise<VoiceSessionLogResult> {
  const validationError = validateVoiceSessionPayload(payload);
  if (validationError) {
    return { error: validationError };
  }

  try {
    const { error } = await client.from('tenant_voice_sessions').insert({
      tenant_id: payload.tenantId.trim(),
      session_id: payload.sessionId.trim(),
      audio_duration_ms: payload.audioDurationMs ?? null,
      stt_provider: payload.sttProvider,
      transcript: payload.transcript ?? null,
      latency_ms: payload.latencyMs,
      status: payload.status,
    });

    if (error) {
      return { error: error.message };
    }
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}
