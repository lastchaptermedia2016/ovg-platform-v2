// src/app/api/client/stt/__tests__/client-stt.test.ts
//
// Security + guard suite for the client-surface STT POST handler in ../route.ts.
// Verifies auth, tenant resolution, rate limiting, MIME/size/micro-recording
// gates, and the dynamic brand vocabulary boost — without touching reseller code.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../route';
import { getAuthenticatedUser, createAuthClient } from '@/lib/auth/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

process.env.GROQ_API_KEY = process.env.GROQ_API_KEY || 'test-groq-key';

// ── Groq SDK mock (captures the prompt bias) ─────────────────────────────
let lastGroqPrompt: string | null = null;
vi.mock('groq-sdk', () => {
  class Groq {
    audio = {
      transcriptions: {
        create: vi.fn().mockImplementation((args: { prompt?: string }) => {
          lastGroqPrompt = typeof args?.prompt === 'string' ? args.prompt : null;
          return Promise.resolve({ text: 'hello world' });
        }),
      },
    };
  }
  return { default: Groq, toFile: vi.fn().mockImplementation((blob: Blob) => blob) };
});

// ── Auth + Supabase mocks ─────────────────────────────────────────────────
vi.mock('@/lib/auth/server', () => ({
  getAuthenticatedUser: vi.fn(),
  createAuthClient: vi.fn(),
}));

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: { from: vi.fn() },
}));

const mockAuth = vi.mocked(getAuthenticatedUser);
const mockCreateAuthClient = vi.mocked(createAuthClient);
const mockAdminFrom = vi.mocked(supabaseAdmin.from);

/** Build a chain that resolves (or fails to resolve) the tenant. */
function makeAuthChain(opts: { resellerId?: string | null } = {}) {
  const resellerId = opts.resellerId === undefined ? 'r1' : opts.resellerId;
  return {
    from: (table: string) => ({
      select: () => {
        if (table === 'user_resellers') {
          return {
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve(
                  resellerId === null
                    ? { data: null, error: null }
                    : { data: { reseller_id: resellerId }, error: null },
                ),
            }),
          };
        }
        return { eq: () => Promise.resolve({ data: [{ id: 'tenant-1' }], error: null }) };
      },
    }),
  };
}

function makeAdminChain(brandName: string | null = 'Acme') {
  return {
    select: () => ({
      eq: () => ({
        maybeSingle: () =>
          Promise.resolve({
            data: brandName
              ? { widget_config: { branding: { brandName } } }
              : { widget_config: null },
            error: null,
          }),
      }),
    }),
  };
}

function formRequest(file: Blob | null, ip = '1.1.1.1'): NextRequest {
  const form = new FormData();
  if (file) form.append('file', file, 'rec.wav');
  return new NextRequest('http://localhost/api/client/stt', {
    method: 'POST',
    body: form,
    headers: { 'x-forwarded-for': ip },
  });
}

const okBlob = () => new Blob([new Uint8Array(20_000)], { type: 'audio/wav' });

beforeEach(() => {
  lastGroqPrompt = null;
  mockAuth.mockResolvedValue({
    user: null,
    userId: 'client-user',
    email: 'client@example.com',
    error: null,
  });
  mockCreateAuthClient.mockResolvedValue(makeAuthChain() as never);
  mockAdminFrom.mockReturnValue(makeAdminChain() as never);
});

describe('POST /api/client/stt', () => {
  it('rejects unauthenticated requests with 401', async () => {
    mockAuth.mockResolvedValue({
      user: null,
      userId: null,
      email: null,
      error: new Error('Unauthorized'),
    });
    const res = await POST(formRequest(okBlob(), 'ip-401'));
    expect(res.status).toBe(401);
  });

  it('rejects when no tenant is resolved with 403', async () => {
    mockCreateAuthClient.mockResolvedValue(makeAuthChain({ resellerId: null }) as never);
    const res = await POST(formRequest(okBlob(), 'ip-403'));
    expect(res.status).toBe(403);
  });

  it('rate-limits a single IP after 15 requests (429)', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 16; i++) {
      const res = await POST(formRequest(okBlob(), 'ip-ratelimit'));
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 15).every((s) => s === 200)).toBe(true);
    expect(statuses[15]).toBe(429);
  });

  it('rejects unsupported MIME types with 415', async () => {
    const bad = new Blob([new Uint8Array(20_000)], { type: 'audio/flac' });
    const res = await POST(formRequest(bad, 'ip-415'));
    expect(res.status).toBe(415);
  });

  it('rejects oversized uploads with 413', async () => {
    const big = new Blob([new Uint8Array(2 * 1024 * 1024 + 100)], { type: 'audio/wav' });
    const res = await POST(formRequest(big, 'ip-413'));
    expect(res.status).toBe(413);
  });

  it('rejects micro-recordings with 422', async () => {
    const tiny = new Blob([new Uint8Array(1_000)], { type: 'audio/wav' });
    const res = await POST(formRequest(tiny, 'ip-422'));
    expect(res.status).toBe(422);
  });

  it('rejects a missing file field with 400', async () => {
    const res = await POST(formRequest(null, 'ip-400'));
    expect(res.status).toBe(400);
  });

  it('transcribes successfully and injects the tenant brand into the vocab boost', async () => {
    const res = await POST(formRequest(okBlob(), 'ip-200'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { text?: string };
    expect(body.text).toBe('hello world');
    expect(lastGroqPrompt).toContain('Acme');
    expect(lastGroqPrompt).toContain('Zeeder');
  });
});
