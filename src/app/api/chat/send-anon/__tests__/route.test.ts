// Deterministic suite for the public send-anon lead-capture interceptor.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../route';

let capturedInserts: Record<string, unknown>[] = [];

function createMockChain() {
  const chain: Record<string, unknown> = {};
  for (const m of ['from', 'select', 'eq', 'in', 'order', 'limit', 'maybeSingle', 'update']) {
    chain[m] = vi.fn().mockImplementation(() => chain);
  }
  chain.insert = vi.fn().mockImplementation((payload: Record<string, unknown>) => {
    capturedInserts.push(payload);
    return chain;
  });
  chain.then = (onFulfilled: (v: { data: unknown[]; error: null }) => unknown) =>
    Promise.resolve({ data: [], error: null }).then(onFulfilled);
  return chain;
}

vi.mock('@/lib/supabase/admin', () => {
  const chain = createMockChain();
  chain.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
  return { supabaseAdmin: chain };
});

vi.mock('@/core/tenant/db', () => ({
  getTenantBySlug: vi.fn().mockResolvedValue({ id: 'tenant-internal', tenant_id: 'demo' }),
}));

function post(body: Record<string, unknown>) {
  return POST(
    new NextRequest('http://localhost/api/chat/send-anon', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  capturedInserts = [];
  vi.clearAllMocks();
});

describe('POST /api/chat/send-anon - Lead Capture', () => {
  it('persists a lead when the visitor message carries a phone', async () => {
    const res = await post({
      tenantId: 'demo',
      message: 'Peter, 8897897890',
      conversationId: '11111111-1111-1111-1111-111111111111',
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);

    const leadInsert = capturedInserts.find(
      (p) => p.tenant_id === 'tenant-internal' && p.status === 'LEAD',
    );
    expect(leadInsert).toBeTruthy();
    expect(leadInsert?.client_name).toBe('Peter');
    expect(leadInsert?.client_phone).toBe('8897897890');
    expect(leadInsert?.initial_intent).toBeTruthy();
  });

  it('does NOT persist a lead when the message has no phone', async () => {
    const res = await post({
      tenantId: 'demo',
      message: 'hello what are your hours',
      conversationId: '22222222-2222-2222-2222-222222222222',
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);

    const leadInsert = capturedInserts.find((p) => p.status === 'LEAD');
    expect(leadInsert).toBeFalsy();
  });

  it('rejects missing tenantId or message', async () => {
    const res = await post({ conversationId: '33333333-3333-3333-3333-333333333333' });
    expect(res.status).toBe(400);
  });

  it('rejects an invalid conversationId', async () => {
    const res = await post({ tenantId: 'demo', message: 'hi', conversationId: 'not-a-uuid' });
    expect(res.status).toBe(400);
  });
});