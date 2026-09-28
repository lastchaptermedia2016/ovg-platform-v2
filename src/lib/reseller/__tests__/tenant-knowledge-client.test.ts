// src/lib/reseller/__tests__/tenant-knowledge-client.test.ts
//
// Phase 4.4 — Tenant Knowledge transport layer:
//   - the tenantId is validated client-side before any network call
//   - GET/POST/PATCH/DELETE honour the Phase 4.2 endpoint contract exactly
//     (scoped query string, 201-only create, `?permanent=true` hard delete)
//   - non-2xx statuses, `{ error }` payloads, malformed bodies and network
//     throws all resolve as `{ ok: false, error }` and are never thrown

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  listTenantKnowledge,
  createKnowledgeEntry,
  updateKnowledgeEntry,
  deleteKnowledgeEntry,
} from '../tenant-knowledge-client';
import type { KnowledgeItem } from '../tenant-knowledge-engine';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const ENTRY_ID = '22222222-2222-4222-8222-222222222222';
const LIST_PATH = '/api/reseller/tenant-knowledge';

function makeItem(overrides: Partial<KnowledgeItem> = {}): KnowledgeItem {
  return {
    id: ENTRY_ID,
    tenant_id: TENANT_ID,
    title: 'Business Hours',
    content: 'We are open Monday to Friday, 9am to 5pm.',
    category: 'faq',
    is_active: true,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-02T00:00:00.000Z',
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const SHAPE_ERROR = 'Unexpected response shape from knowledge API';

describe('tenant-knowledge-client', () => {
  const originalFetch = global.fetch;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.clearAllMocks();
  });

  it('rejects a non-UUID tenant id without touching the network', async () => {
    const result = await listTenantKnowledge('not-a-uuid');

    expect(result).toEqual({ ok: false, error: 'A valid tenant ID is required' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('lists entries through the tenant-scoped GET endpoint', async () => {
    const item = makeItem();
    fetchMock.mockResolvedValue(jsonResponse({ success: true, data: [item] }));

    const result = await listTenantKnowledge(TENANT_ID);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      `${LIST_PATH}?tenantId=${TENANT_ID}`,
      { method: 'GET' },
    );
    expect(result).toEqual({ ok: true, items: [item] });
  });

  it('surfaces the server error message on a non-2xx list response', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: 'Forbidden: You do not manage this tenant' }, 403),
    );

    const result = await listTenantKnowledge(TENANT_ID);

    expect(result).toEqual({
      ok: false,
      error: 'Forbidden: You do not manage this tenant',
    });
  });

  it('falls back to the HTTP status when the error payload is blank', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: '   ' }, 500));

    const result = await listTenantKnowledge(TENANT_ID);

    expect(result).toEqual({ ok: false, error: 'Request failed (500)' });
  });

  it('reports an unexpected payload shape instead of leaking malformed rows', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: [{ id: 'not-a-row' }] }));

    const result = await listTenantKnowledge(TENANT_ID);

    expect(result).toEqual({ ok: false, error: SHAPE_ERROR });
  });

  it('captures a network throw as an error result', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));

    const result = await listTenantKnowledge(TENANT_ID);

    expect(result).toEqual({ ok: false, error: 'network down' });
  });

  it('handles a non-JSON response body without throwing', async () => {
    fetchMock.mockResolvedValue(new Response('boom', { status: 502 }));

    const result = await listTenantKnowledge(TENANT_ID);

    expect(result).toEqual({ ok: false, error: 'Request failed (502)' });
  });

  it('creates an entry with POST and requires a 201 response', async () => {
    const item = makeItem({ title: 'Parking' });
    fetchMock.mockResolvedValue(jsonResponse({ success: true, data: item }, 201));

    const input = {
      tenantId: TENANT_ID,
      title: 'Parking',
      content: 'Free parking out back.',
      category: null,
      isActive: true,
    };
    const result = await createKnowledgeEntry(input);

    expect(fetchMock).toHaveBeenCalledWith(LIST_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    expect(result).toEqual({ ok: true, item });
  });

  it('treats a 200 create response as a failure (contract requires 201)', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true, data: makeItem() }, 200));

    const result = await createKnowledgeEntry({
      tenantId: TENANT_ID,
      title: 'Parking',
      content: 'Free parking out back.',
    });

    expect(result).toEqual({ ok: false, error: 'Request failed (200)' });
  });

  it('surfaces the API validation message for a rejected create', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: 'Invalid request: Title is required' }, 400),
    );

    const result = await createKnowledgeEntry({
      tenantId: TENANT_ID,
      title: '',
      content: 'x',
    });

    expect(result).toEqual({ ok: false, error: 'Invalid request: Title is required' });
  });

  it('patches a single entry using the id path with a partial body', async () => {
    const updated = makeItem({ is_active: false });
    fetchMock.mockResolvedValue(jsonResponse({ success: true, data: updated }));

    const result = await updateKnowledgeEntry(ENTRY_ID, { is_active: false });

    expect(fetchMock).toHaveBeenCalledWith(`${LIST_PATH}/${ENTRY_ID}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: false }),
    });
    expect(result).toEqual({ ok: true, item: updated });
  });

  it('reports a shape error when a patch response omits a required field', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ success: true, data: { id: ENTRY_ID, tenant_id: TENANT_ID } }),
    );

    const result = await updateKnowledgeEntry(ENTRY_ID, { is_active: false });

    expect(result).toEqual({ ok: false, error: SHAPE_ERROR });
  });

  it('soft-deletes by default and reports the soft mode', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true, mode: 'soft' }));

    const result = await deleteKnowledgeEntry(ENTRY_ID);

    expect(fetchMock).toHaveBeenCalledWith(`${LIST_PATH}/${ENTRY_ID}`, {
      method: 'DELETE',
    });
    expect(result).toEqual({ ok: true, mode: 'soft' });
  });

  it('requests a permanent delete when asked and reports that mode', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true, mode: 'permanent' }));

    const result = await deleteKnowledgeEntry(ENTRY_ID, { permanent: true });

    expect(fetchMock).toHaveBeenCalledWith(`${LIST_PATH}/${ENTRY_ID}?permanent=true`, {
      method: 'DELETE',
    });
    expect(result).toEqual({ ok: true, mode: 'permanent' });
  });

  it('defaults an unrecognised delete mode to soft', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true }));

    const result = await deleteKnowledgeEntry(ENTRY_ID);

    expect(result).toEqual({ ok: true, mode: 'soft' });
  });

  it('surfaces a failed permanent delete without throwing', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'Failed to delete knowledge entry' }, 500));

    const result = await deleteKnowledgeEntry(ENTRY_ID, { permanent: true });

    expect(result).toEqual({ ok: false, error: 'Failed to delete knowledge entry' });
  });
});
