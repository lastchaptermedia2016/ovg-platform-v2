// src/lib/voice/__tests__/voice-logger.test.ts
//
// Phase 5 — voice session logger scoping: strict tenant_id validation must
// reject invalid payloads with ZERO database calls (orphan prevention),
// and successful writes must be strictly scoped to the validated tenant.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  logVoiceSession,
  validateVoiceSessionPayload,
  type VoiceSessionPayload,
} from '../voice-logger';

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: { from: vi.fn() },
}));

const TENANT_ID = '11111111-1111-4111-8111-111111111111';

function makePayload(overrides: Partial<VoiceSessionPayload> = {}): VoiceSessionPayload {
  return {
    tenantId: TENANT_ID,
    sessionId: 'session-abc',
    sttProvider: 'whisper',
    transcript: 'hello world',
    latencyMs: 120,
    status: 'completed',
    ...overrides,
  };
}

interface Captured {
  fromCalls: string[];
  inserts: Array<Record<string, unknown>>;
}

/** Supabase test double capturing table + insert payload. */
function makeClient(
  insertResult: { error: { message: string } | null } = { error: null },
): { client: SupabaseClient; captured: Captured } {
  const captured: Captured = { fromCalls: [], inserts: [] };
  const client = {
    from: (table: string) => {
      captured.fromCalls.push(table);
      return {
        insert: async (row: Record<string, unknown>) => {
          captured.inserts.push(row);
          return insertResult;
        },
      };
    },
  };
  return { client: client as unknown as SupabaseClient, captured };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('validateVoiceSessionPayload', () => {
  it('accepts a complete, valid payload', () => {
    expect(validateVoiceSessionPayload(makePayload())).toBeNull();
  });

  it('rejects a missing/blank tenantId', () => {
    expect(validateVoiceSessionPayload(makePayload({ tenantId: '' }))).toMatch(/tenantId/);
    expect(validateVoiceSessionPayload(makePayload({ tenantId: '   ' }))).toMatch(/tenantId/);
  });

  it('rejects a non-UUID tenantId', () => {
    expect(validateVoiceSessionPayload(makePayload({ tenantId: 'not-a-uuid' }))).toMatch(
      /tenantId/,
    );
  });

  it('rejects an unknown sttProvider or status', () => {
    expect(
      validateVoiceSessionPayload(
        makePayload({ sttProvider: 'google' as unknown as VoiceSessionPayload['sttProvider'] }),
      ),
    ).toMatch(/sttProvider/);
    expect(
      validateVoiceSessionPayload(
        makePayload({ status: 'weird' as unknown as VoiceSessionPayload['status'] }),
      ),
    ).toMatch(/status/);
  });

  it('rejects negative latency or duration values', () => {
    expect(validateVoiceSessionPayload(makePayload({ latencyMs: -1 }))).toMatch(/latencyMs/);
    expect(validateVoiceSessionPayload(makePayload({ audioDurationMs: -5 }))).toMatch(
      /audioDurationMs/,
    );
  });
});

describe('logVoiceSession', () => {
  it('rejects an invalid tenantId with ZERO database calls (orphan prevention)', async () => {
    const { client, captured } = makeClient();
    const result = await logVoiceSession(makePayload({ tenantId: 'evil-tenant' }), client);

    expect(result.error).toMatch(/tenantId/);
    expect(captured.fromCalls).toHaveLength(0);
    expect(captured.inserts).toHaveLength(0);
  });

  it('rejects a missing sessionId with ZERO database calls', async () => {
    const { client, captured } = makeClient();
    const result = await logVoiceSession(makePayload({ sessionId: '' }), client);

    expect(result.error).toMatch(/sessionId/);
    expect(captured.fromCalls).toHaveLength(0);
  });

  it('inserts a strictly tenant-scoped row into tenant_voice_sessions', async () => {
    const { client, captured } = makeClient();
    const result = await logVoiceSession(
      makePayload({ audioDurationMs: 640, transcript: 'book a service' }),
      client,
    );

    expect(result.error).toBeNull();
    expect(captured.fromCalls).toEqual(['tenant_voice_sessions']);
    expect(captured.inserts).toEqual([
      {
        tenant_id: TENANT_ID,
        session_id: 'session-abc',
        audio_duration_ms: 640,
        stt_provider: 'whisper',
        transcript: 'book a service',
        latency_ms: 120,
        status: 'completed',
      },
    ]);
  });

  it('maps Postgrest insert errors into the result union', async () => {
    const { client } = makeClient({ error: { message: 'permission denied' } });
    const result = await logVoiceSession(makePayload(), client);

    expect(result.error).toBe('permission denied');
  });

  it('never throws when the database client itself throws', async () => {
    const explodingClient = {
      from: () => {
        throw new Error('connection reset');
      },
    } as unknown as SupabaseClient;

    const result = await logVoiceSession(makePayload(), explodingClient);
    expect(result.error).toBe('connection reset');
  });
});
