// src/app/api/reseller/tenant-knowledge/__tests__/route.test.ts
//
// Phase 4.2 — CRUD route guards: authentication (401), tenant authorization
// (403), schema validation (400), missing row (404), and successful flows —
// every query asserted as explicitly scoped by tenant_id (isolation).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST } from '../route';
import { PATCH, DELETE } from '../[id]/route';
import { getAuthenticatedUser, validateTenantOwnership } from '@/lib/auth/server';

const USER_ID = '33333333-3333-4333-8333-333333333333';
const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const ENTRY_ID = '22222222-2222-4222-8222-222222222222';
const RESELLER_ID = '44444444-4444-4444-8444-444444444444';

// Recorded Supabase interactions (the protected writes / isolation scopes).
let captured: {
  from: string[];
  eq: Array<[string, unknown]>;
  inserts: Array<Record<string, unknown>>;
  updates: Array<Record<string, unknown>>;
  deletes: number;
};
// Sequential terminal results (maybeSingle / single / order) consumed FIFO.
let terminals: Array<{ data: unknown; error: unknown }>;

function pushTerminal(data: unknown, error: unknown = null): void {
  terminals.push({ data, error });
}

function nextTerminal(): { data: unknown; error: unknown } {
  if (terminals.length === 0) return { data: null, error: null };
  const next = terminals.shift();
  return next ?? { data: null, error: null };
}

function createMockChain(): Record<string, unknown> {
  const chain: Record<string, unknown> = {};
  chain.from = vi.fn().mockImplementation((table: string) => {
    captured.from.push(table);
    return chain;
  });
  chain.select = vi.fn().mockImplementation(() => chain);
  chain.eq = vi.fn().mockImplementation((column: string, value: unknown) => {
    captured.eq.push([column, value]);
    return chain;
  });
  chain.insert = vi.fn().mockImplementation((payload: Record<string, unknown>) => {
    captured.inserts.push(payload);
    return chain;
  });
  chain.update = vi.fn().mockImplementation((payload: Record<string, unknown>) => {
    captured.updates.push(payload);
    return chain;
  });
  chain.delete = vi.fn().mockImplementation(() => {
    captured.deletes += 1;
    return chain;
  });
  chain.order = vi.fn().mockImplementation(() => Promise.resolve(nextTerminal()));
  chain.maybeSingle = vi.fn().mockImplementation(() => Promise.resolve(nextTerminal()));
  chain.single = vi.fn().mockImplementation(() => Promise.resolve(nextTerminal()));
  return chain;
}

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: createMockChain(),
}));

vi.mock('@/lib/auth/server', () => ({
  getAuthenticatedUser: vi.fn(),
  validateTenantOwnership: vi.fn(),
}));

const BASE = 'http://localhost:3000/api/reseller/tenant-knowledge';

function getRequest(search = ''): NextRequest {
  return new NextRequest(`${BASE}${search}`);
}

function postRequest(body: string): NextRequest {
  return new NextRequest(BASE, { method: 'POST', body });
}

function patchRequest(body: string): NextRequest {
  return new NextRequest(`${BASE}/${ENTRY_ID}`, { method: 'PATCH', body });
}

function deleteRequest(search = ''): NextRequest {
  return new NextRequest(`${BASE}/${ENTRY_ID}${search}`, { method: 'DELETE' });
}

const idParams = (id: string = ENTRY_ID) => ({ params: Promise.resolve({ id }) });

describe('api/reseller/tenant-knowledge CRUD', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    terminals = [];
    captured = { from: [], eq: [], inserts: [], updates: [], deletes: 0 };

    vi.mocked(getAuthenticatedUser).mockResolvedValue({
      user: null,
      userId: USER_ID,
      email: null,
      error: null,
    });
    vi.mocked(validateTenantOwnership).mockResolvedValue({ resellerId: RESELLER_ID });
  });
  // ── GET ─────────────────────────────────────────────────────────────
  it('GET returns 401 when unauthenticated', async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue({
      user: null,
      userId: null,
      email: null,
      error: new Error('Unauthorized'),
    });

    const res = await GET(getRequest(`?tenantId=${TENANT_ID}`));
    const body = (await res.json()) as { error: string };

    expect(res.status).toBe(401);
    expect(typeof body.error).toBe('string');
  });

  it('GET returns 400 when tenantId is missing or invalid', async () => {
    const res = await GET(getRequest());
    const body = (await res.json()) as { error: string };

    expect(res.status).toBe(400);
    expect(typeof body.error).toBe('string');
    expect(validateTenantOwnership).not.toHaveBeenCalled();
  });

  it('GET returns 403 when the caller does not manage the tenant', async () => {
    vi.mocked(validateTenantOwnership).mockResolvedValue(null);

    const res = await GET(getRequest(`?tenantId=${TENANT_ID}`));

    expect(res.status).toBe(403);
    expect(captured.from).toEqual([]);
  });

  it('GET returns records scoped by tenant_id', async () => {
    pushTerminal([
      { id: ENTRY_ID, tenant_id: TENANT_ID, title: 'Hours', content: '9-5', is_active: true },
    ]);

    const res = await GET(getRequest(`?tenantId=${TENANT_ID}`));
    const body = (await res.json()) as { success: boolean; data: unknown[] };

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(captured.from).toEqual(['tenant_knowledge']);
    expect(captured.eq).toContainEqual(['tenant_id', TENANT_ID]);
    expect(validateTenantOwnership).toHaveBeenCalledWith(USER_ID, TENANT_ID);
  });
  // ── POST ────────────────────────────────────────────────────────────
  it('POST returns 401 when unauthenticated', async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue({
      user: null,
      userId: null,
      email: null,
      error: new Error('Unauthorized'),
    });

    const res = await POST(postRequest(JSON.stringify({ tenantId: TENANT_ID })));

    expect(res.status).toBe(401);
    expect(captured.inserts).toHaveLength(0);
  });

  it('POST returns 400 for missing required fields', async () => {
    const res = await POST(postRequest(JSON.stringify({ tenantId: TENANT_ID })));
    const body = (await res.json()) as { error: string };

    expect(res.status).toBe(400);
    expect(body.error).toContain('Invalid request');
    expect(captured.inserts).toHaveLength(0);
  });

  it('POST returns 400 for malformed JSON', async () => {
    const res = await POST(postRequest('not-json'));
    const body = (await res.json()) as { error: string };

    expect(res.status).toBe(400);
    expect(body.error).toBe('Invalid JSON');
  });

  it('POST returns 403 when the caller does not manage the tenant', async () => {
    vi.mocked(validateTenantOwnership).mockResolvedValue(null);

    const res = await POST(
      postRequest(
        JSON.stringify({ tenantId: TENANT_ID, title: 'Hours', content: 'Open 9-5' }),
      ),
    );

    expect(res.status).toBe(403);
    expect(captured.inserts).toHaveLength(0);
  });

  it('POST inserts a tenant-scoped row and returns 201', async () => {
    const createdRow = {
      id: ENTRY_ID,
      tenant_id: TENANT_ID,
      title: 'Hours',
      content: 'Open 9-5',
      category: 'faq',
      is_active: true,
    };
    pushTerminal(createdRow);

    const res = await POST(
      postRequest(
        JSON.stringify({
          tenantId: TENANT_ID,
          title: 'Hours',
          content: 'Open 9-5',
          category: 'faq',
        }),
      ),
    );
    const body = (await res.json()) as { success: boolean; data: typeof createdRow };

    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.data.title).toBe('Hours');
    expect(captured.inserts).toHaveLength(1);
    expect(captured.inserts[0]).toEqual({
      tenant_id: TENANT_ID,
      title: 'Hours',
      content: 'Open 9-5',
      category: 'faq',
      is_active: true,
    });
    expect(validateTenantOwnership).toHaveBeenCalledWith(USER_ID, TENANT_ID);
  });



  // ── PATCH ───────────────────────────────────────────────────────────
  it('PATCH returns 401 when unauthenticated', async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue({
      user: null,
      userId: null,
      email: null,
      error: new Error('Unauthorized'),
    });

    const res = await PATCH(patchRequest(JSON.stringify({ title: 'x' })), idParams());

    expect(res.status).toBe(401);
    expect(captured.updates).toHaveLength(0);
  });

  it('PATCH returns 400 for a non-UUID entry id', async () => {
    const res = await PATCH(patchRequest(JSON.stringify({ title: 'x' })), idParams('nope'));

    expect(res.status).toBe(400);
    expect(captured.updates).toHaveLength(0);
  });

  it('PATCH returns 400 when the body has no updatable fields', async () => {
    const res = await PATCH(patchRequest(JSON.stringify({})), idParams());
    const body = (await res.json()) as { error: string };

    expect(res.status).toBe(400);
    expect(body.error).toContain('Invalid request');
    expect(captured.updates).toHaveLength(0);
  });

  it('PATCH returns 404 when the entry does not exist', async () => {
    pushTerminal(null);

    const res = await PATCH(patchRequest(JSON.stringify({ title: 'New title' })), idParams());

    expect(res.status).toBe(404);
    expect(captured.updates).toHaveLength(0);
  });

  it('PATCH returns 403 when the caller does not manage the row tenant', async () => {
    pushTerminal({ id: ENTRY_ID, tenant_id: TENANT_ID });
    vi.mocked(validateTenantOwnership).mockResolvedValue(null);

    const res = await PATCH(patchRequest(JSON.stringify({ title: 'New title' })), idParams());

    expect(res.status).toBe(403);
    expect(validateTenantOwnership).toHaveBeenCalledWith(USER_ID, TENANT_ID);
    expect(captured.updates).toHaveLength(0);
  });

  it('PATCH updates only after tenant ownership passes, scoped by tenant_id', async () => {
    pushTerminal({ id: ENTRY_ID, tenant_id: TENANT_ID });
    pushTerminal({ id: ENTRY_ID, tenant_id: TENANT_ID, is_active: false });

    const res = await PATCH(patchRequest(JSON.stringify({ is_active: false })), idParams());
    const body = (await res.json()) as { success: boolean };

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(captured.updates).toEqual([{ is_active: false }]);
    expect(captured.eq).toContainEqual(['id', ENTRY_ID]);
    expect(captured.eq).toContainEqual(['tenant_id', TENANT_ID]);
  });

  // ── DELETE ──────────────────────────────────────────────────────────
  it('DELETE returns 401 when unauthenticated', async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue({
      user: null,
      userId: null,
      email: null,
      error: new Error('Unauthorized'),
    });

    const res = await DELETE(deleteRequest(), idParams());

    expect(res.status).toBe(401);
    expect(captured.deletes).toBe(0);
    expect(captured.updates).toHaveLength(0);
  });

  it('DELETE returns 404 when the entry does not exist', async () => {
    pushTerminal(null);

    const res = await DELETE(deleteRequest(), idParams());

    expect(res.status).toBe(404);
    expect(captured.deletes).toBe(0);
  });

  it('DELETE returns 403 when the caller does not manage the row tenant', async () => {
    pushTerminal({ id: ENTRY_ID, tenant_id: TENANT_ID });
    vi.mocked(validateTenantOwnership).mockResolvedValue(null);

    const res = await DELETE(deleteRequest(), idParams());

    expect(res.status).toBe(403);
    expect(captured.deletes).toBe(0);
    expect(captured.updates).toHaveLength(0);
  });

  it('DELETE soft-deletes (is_active = false) by default', async () => {
    pushTerminal({ id: ENTRY_ID, tenant_id: TENANT_ID });

    const res = await DELETE(deleteRequest(), idParams());
    const body = (await res.json()) as { success: boolean; mode: string };

    expect(res.status).toBe(200);
    expect(body.mode).toBe('soft');
    expect(captured.deletes).toBe(0);
    expect(captured.updates).toEqual([{ is_active: false }]);
    expect(captured.eq).toContainEqual(['tenant_id', TENANT_ID]);
  });

  it('DELETE hard-deletes when ?permanent=true', async () => {
    pushTerminal({ id: ENTRY_ID, tenant_id: TENANT_ID });

    const res = await DELETE(deleteRequest('?permanent=true'), idParams());
    const body = (await res.json()) as { success: boolean; mode: string };

    expect(res.status).toBe(200);
    expect(body.mode).toBe('permanent');
    expect(captured.deletes).toBe(1);
    expect(captured.eq).toContainEqual(['id', ENTRY_ID]);
    expect(captured.eq).toContainEqual(['tenant_id', TENANT_ID]);
  });
});
