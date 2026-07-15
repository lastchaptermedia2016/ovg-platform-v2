// src/app/api/ai/create-client/__tests__/create-client.test.ts
//
// Guards the multi-tenant isolation fix in ../route.ts:
//   - an authenticated user NOT linked to the resolved reseller must receive 403
//     and the service-role tenant insert must NOT be executed.
//   - an authenticated user linked to the reseller proceeds to the insert.
//
// Groq is mocked (unused in MODE 1), Supabase clients are fluent thenable
// mocks so terminal calls (single / maybeSingle) resolve predictably.

process.env.GROQ_API_KEY = process.env.GROQ_API_KEY || 'test-groq-key';
process.env.NEXT_PUBLIC_APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../route';
import { getAuthenticatedUser } from '@/lib/auth/server';

const RESOLVED_RESELLER_ID = 'reseller-uuid-fixed';
const CALLER_USER_ID = 'caller-user-uuid';
const OTHER_USER_ID = 'other-user-uuid';

// Captured service-role tenant inserts (the protected write).
let capturedInserts: Record<string, unknown>[] = [];
// What maybeSingle / single terminal resolves to (shared by membership + insert).
let terminal: { data: unknown; error: unknown };

function makeTerminal(data: unknown) {
  return { data, error: null };
}

function createMockChain(): Record<string, unknown> {
  const chain: Record<string, unknown> = {};
  const builderMethods = ['from', 'select', 'eq', 'or', 'in', 'order', 'update'];
  for (const m of builderMethods) {
    chain[m] = vi.fn().mockImplementation(() => chain);
  }
  chain.insert = vi.fn().mockImplementation((payload: Record<string, unknown>) => {
    capturedInserts.push(payload);
    return chain;
  });
  chain.maybeSingle = vi.fn().mockImplementation(() => Promise.resolve(terminal));
  chain.single = vi.fn().mockImplementation(() => Promise.resolve(terminal));
  chain.limit = vi.fn().mockImplementation(() => Promise.resolve({ data: [], error: null }));
  chain.auth = {
    getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'caller-user-uuid' } }, error: null }),
  };
  return chain;
}

vi.mock('groq-sdk', () => {
  class Groq {
    chat = { completions: { create: vi.fn().mockResolvedValue({ choices: [{ message: { content: '{}' } }] }) } };
  }
  return { default: Groq };
});

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockImplementation(createMockChain),
}));

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: createMockChain(),
}));

vi.mock('@/lib/auth/server', () => ({
  getAuthenticatedUser: vi.fn(),
}));

vi.mock('@/lib/supabase/resolve-reseller-id', () => ({
  resolveResellerId: vi.fn().mockImplementation(() => Promise.resolve(RESOLVED_RESELLER_ID)),
}));

function postCreate(body: Record<string, unknown>): Promise<Response> {
  return POST(
    new NextRequest('http://localhost:3000/api/ai/create-client', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  );
}

const validClientData = {
  name: 'Acme Motors',
  industry: 'AUTOMOTIVE',
  email: null,
  mobile: null,
  website: null,
  systemPrompt: null,
  is_override: false,
  confidence: 0,
};

describe('create-client multi-tenant isolation guard', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    capturedInserts = [];
    terminal = makeTerminal({ id: 'new-tenant-uuid', name: 'Acme Motors', industry: 'AUTOMOTIVE' });
    // The route makes a real internal fetch to /api/ai/apply-vibe after a
    // successful insert. Stub it so the test is deterministic and never hangs
    // when a dev server is listening on NEXT_PUBLIC_APP_URL.
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ widgetConfig: { vibeName: 'Test Vibe' } }),
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('returns 403 and never inserts when the user is not linked to the reseller', async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue({
      userId: OTHER_USER_ID,
      email: null,
      user: null,
      error: null,
    });
    // No user_resellers link for this user.
    terminal = makeTerminal(null);

    const res = await postCreate({ resellerSlug: 'active-slug', clientData: validClientData });

    expect(res.status).toBe(403);
    expect(capturedInserts).toHaveLength(0);
  });

  it('proceeds to the tenant insert when the caller is linked to the reseller', async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue({
      userId: CALLER_USER_ID,
      email: null,
      user: null,
      error: null,
    });
    // Linked: user_resellers row present for this reseller.
    terminal = makeTerminal({ reseller_id: RESOLVED_RESELLER_ID });

    const res = await postCreate({ resellerSlug: 'active-slug', clientData: validClientData });

    expect(res.status).toBe(200);
    expect(capturedInserts).toHaveLength(1);
    expect((capturedInserts[0] as { reseller_id: string }).reseller_id).toBe(RESOLVED_RESELLER_ID);
  });

  it('returns 401 when there is no authenticated user', async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue({
      userId: null,
      email: null,
      user: null,
      error: new Error('Unauthorized'),
    });

    const res = await postCreate({ resellerSlug: 'active-slug', clientData: validClientData });

    expect(res.status).toBe(401);
    expect(capturedInserts).toHaveLength(0);
  });
});
