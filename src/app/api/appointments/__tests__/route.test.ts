// Deterministic suite for the appointments DELETE handler — verifies the
// auth → tenant → user_resellers ownership chain and the id + tenant_id
// double-scoped hard delete that keeps tenants isolated.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { DELETE } from '../route';
import { getUserFromRequest } from '@/lib/auth/server';
import { getTenantBySlug } from '@/core/tenant/db';

// Shared mutable state referenced by the hoisted supabaseAdmin mock factory.
const mocks = vi.hoisted(() => ({
  membership: { data: { reseller_id: 'reseller-1' } as unknown, error: null as unknown },
  deleteResult: {
    data: { id: '11111111-1111-1111-1111-111111111111' } as unknown,
    error: null as unknown,
  },
  /** eq(col, val) pairs recorded on the tenant_appointments chain. */
  deleteFilters: [] as [string, unknown][],
}));

vi.mock('@/lib/supabase/admin', () => {
  function makeChain(table: string) {
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'delete', 'update', 'order', 'limit', 'in', 'or']) {
      chain[m] = vi.fn().mockImplementation((col?: string, val?: unknown) => {
        if (table === 'tenant_appointments' && m === 'eq' && col !== undefined) {
          mocks.deleteFilters.push([col, val]);
        }
        return chain;
      });
    }
    chain.maybeSingle = vi.fn().mockImplementation(() =>
      Promise.resolve(table === 'user_resellers' ? mocks.membership : mocks.deleteResult),
    );
    return chain;
  }
  return { supabaseAdmin: { from: vi.fn((table: string) => makeChain(table)) } };
});

vi.mock('@/core/tenant/db', () => ({
  getTenantBySlug: vi.fn(),
}));

vi.mock('@/lib/auth/server', () => ({
  getUserFromRequest: vi.fn(),
}));

const mockGetUser = vi.mocked(getUserFromRequest);
const mockGetTenant = vi.mocked(getTenantBySlug);

const AUTHENTICATED = {
  user: { id: 'user-1' },
  userId: 'user-1',
  email: 'user@example.com',
  error: null,
} as unknown as Awaited<ReturnType<typeof getUserFromRequest>>;

const UNAUTHENTICATED = {
  user: null,
  userId: null,
  email: null,
  error: new Error('Unauthorized'),
} as unknown as Awaited<ReturnType<typeof getUserFromRequest>>;

const TENANT = {
  id: 'tenant-uuid-1',
  tenant_id: 'demo',
  reseller_id: 'reseller-1',
};

function del(body: Record<string, unknown>) {
  return DELETE(
    new NextRequest('http://localhost/api/appointments', {
      method: 'DELETE',
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.membership = { data: { reseller_id: 'reseller-1' }, error: null };
  mocks.deleteResult = {
    data: { id: '11111111-1111-1111-1111-111111111111' },
    error: null,
  };
  mocks.deleteFilters.length = 0;
  mockGetUser.mockResolvedValue(AUTHENTICATED);
  mockGetTenant.mockResolvedValue(TENANT as Awaited<ReturnType<typeof getTenantBySlug>>);
});

describe('DELETE /api/appointments', () => {
  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue(UNAUTHENTICATED);
    const res = await del({ id: '11111111-1111-1111-1111-111111111111', tenantId: 'demo' });
    expect(res.status).toBe(401);
    expect(mocks.deleteFilters).toHaveLength(0);
  });

  it('returns 400 for an invalid (non-UUID) id', async () => {
    const res = await del({ id: 'not-a-uuid', tenantId: 'demo' });
    expect(res.status).toBe(400);
    expect(mocks.deleteFilters).toHaveLength(0);
  });

  it('returns 400 when tenantId is missing', async () => {
    const res = await del({ id: '11111111-1111-1111-1111-111111111111' });
    expect(res.status).toBe(400);
    expect(mocks.deleteFilters).toHaveLength(0);
  });

  it('returns 404 when the tenant slug is unknown', async () => {
    mockGetTenant.mockResolvedValue(null);
    const res = await del({ id: '11111111-1111-1111-1111-111111111111', tenantId: 'ghost' });
    expect(res.status).toBe(404);
    expect(mocks.deleteFilters).toHaveLength(0);
  });

  it('returns 403 when the user is not a member of the tenant reseller', async () => {
    mocks.membership = { data: { reseller_id: 'other-reseller' }, error: null };
    const res = await del({ id: '11111111-1111-1111-1111-111111111111', tenantId: 'demo' });
    expect(res.status).toBe(403);
    expect(mocks.deleteFilters).toHaveLength(0);
  });

  it('returns 403 when the user has no reseller membership at all', async () => {
    mocks.membership = { data: null, error: null };
    const res = await del({ id: '11111111-1111-1111-1111-111111111111', tenantId: 'demo' });
    expect(res.status).toBe(403);
    expect(mocks.deleteFilters).toHaveLength(0);
  });

  it('scopes the delete by both id and tenant_id', async () => {
    const res = await del({ id: '11111111-1111-1111-1111-111111111111', tenantId: 'demo' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.id).toBe('11111111-1111-1111-1111-111111111111');
    // Both predicates must be present — a forged id alone must not delete.
    expect(mocks.deleteFilters).toEqual(
      expect.arrayContaining([
        ['id', '11111111-1111-1111-1111-111111111111'],
        ['tenant_id', 'tenant-uuid-1'],
      ]),
    );
  });

  it('returns 404 when the row does not exist (or belongs to another tenant)', async () => {
    mocks.deleteResult = { data: null, error: null };
    const res = await del({ id: '22222222-2222-2222-2222-222222222222', tenantId: 'demo' });
    expect(res.status).toBe(404);
  });

  it('returns 500 when the delete fails at the database', async () => {
    mocks.deleteResult = { data: null, error: { message: 'boom' } };
    const res = await del({ id: '11111111-1111-1111-1111-111111111111', tenantId: 'demo' });
    expect(res.status).toBe(500);
  });
});
