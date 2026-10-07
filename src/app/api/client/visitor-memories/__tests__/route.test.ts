// Deterministic suite for the visitor-memories CRM lead-capture interceptor.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../route';
import { supabaseAdmin } from '@/lib/supabase/admin';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';

let capturedInserts: Record<string, unknown>[] = [];

function createMockChain(): Record<string, unknown> {
  const chain: Record<string, unknown> = {};
  for (const m of ['from', 'select', 'eq', 'order', 'limit', 'maybeSingle']) {
    chain[m] = vi.fn().mockImplementation(() => chain);
  }
  chain.insert = vi.fn().mockImplementation((payload: Record<string, unknown>) => {
    capturedInserts.push(payload);
    return chain;
  });
  chain.maybeSingle = vi.fn().mockResolvedValue({
    data: { id: 'tenant-internal-uuid' },
    error: null,
  });
  chain.then = (onFulfilled: (v: { data: unknown[]; error: null }) => unknown) =>
    Promise.resolve({ data: [], error: null }).then(onFulfilled);
  return chain;
}

// vi.mock factories are hoisted above top-level consts, so every value
// referenced inside the factory must be a literal or a vi.hoisted wrapper.
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: createMockChain(),
}));

vi.mock('@/lib/ai/memory-service', () => ({
  normalizeVisitorPhone: vi.fn().mockImplementation((v: string | null) =>
    v ? v.replace(/\D/g, '') : null,
  ),
  normalizeVisitorEmail: vi.fn().mockImplementation((v: string | null) =>
    v ? v.trim().toLowerCase() : null,
  ),
}));

function post(body: Record<string, unknown>) {
  return POST(
    new NextRequest('http://localhost/api/client/visitor-memories', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  capturedInserts = [];
  vi.clearAllMocks();
  // Reset the admin mock to a fresh chain with a valid tenant row.
  vi.mocked(supabaseAdmin).from = vi.fn().mockReturnValue(createMockChain());
});

describe('POST /api/client/visitor-memories - CRM Lead Capture', () => {
  it('persists a CRM lead when a phone is submitted', async () => {
    const res = await post({
      tenantId: TENANT_ID,
      phone: '+27 82 123 4567',
      visitorName: 'Peter',
      initialIntent: 'book a massage on Friday',
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.client_name).toBe('Unknown');

    const leadInsert = capturedInserts.find(
      (p) => p.tenant_id && p.status === 'LEAD',
    );
    expect(leadInsert).toBeTruthy();
    expect(leadInsert?.visitor_phone).toBe('27821234567');
    expect(leadInsert?.visitor_name).toBe('Peter');
    expect(leadInsert?.initial_intent).toBe('book a massage on Friday');
  });

  it('falls back to "Anonymous Visitor" when no name is supplied', async () => {
    await post({
      tenantId: TENANT_ID,
      phone: '0825551212',
    });

    const leadInsert = capturedInserts.find((p) => p.status === 'LEAD');
    expect(leadInsert).toBeTruthy();
    expect(leadInsert?.visitor_name).toBe('Anonymous Visitor');
  });

  it('does NOT persist a lead when no phone is submitted (email-only)', async () => {
    const res = await post({
      tenantId: TENANT_ID,
      email: 'jane@example.com',
    });
    expect(res.status).toBe(200);

    const leadInsert = capturedInserts.find((p) => p.status === 'LEAD');
    expect(leadInsert).toBeFalsy();
  });

  it('rejects an invalid tenantId', async () => {
    const res = await post({ phone: '0825551212', tenantId: 'not-a-uuid' });
    expect(res.status).toBe(400);
  });

  it('does not crash when the lead insert fails (non-blocking)', async () => {
    // Force the lead insert to reject while keeping the tenant resolution intact.
    const errorChain = createMockChain();
    errorChain.insert = vi.fn().mockRejectedValue(new Error('connection refused'));
    vi.mocked(supabaseAdmin).from = vi.fn().mockReturnValue(errorChain);

    const res = await post({
      tenantId: TENANT_ID,
      phone: '0825551212',
      visitorName: 'Test',
    });

    // The route must still return 200 — the lead capture failure is swallowed.
    expect(res.status).toBe(200);
  });
});