// Deterministic suite for the visitor-memories CRM lead-capture interceptor.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../route';
import { upsertAppointmentLead } from '@/lib/booking/lead-dedup';

const mockUpsert = vi.mocked(upsertAppointmentLead);

const TENANT_ID = '11111111-1111-1111-1111-111111111111';

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'tenant-internal-uuid' }, error: null }),
      then: (onFulfilled: (v: { data: unknown[]; error: null }) => unknown) =>
        Promise.resolve({ data: [], error: null }).then(onFulfilled),
    }),
  },
}));

vi.mock('@/lib/booking/lead-dedup', () => ({
  upsertAppointmentLead: vi.fn().mockResolvedValue({ lead: null, deduped: false }),
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
  vi.clearAllMocks();
});

describe('POST /api/client/visitor-memories - CRM Lead Capture', () => {
  it('upserts a CRM lead when a phone is submitted', async () => {
    const res = await post({
      tenantId: TENANT_ID,
      phone: '+27 82 123 4567',
      visitorName: 'Peter',
      initialIntent: 'book a massage on Friday',
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.client_name).toBe('Unknown');

    expect(mockUpsert).toHaveBeenCalledTimes(1);
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        clientName: 'Peter',
        clientPhone: '27821234567',
        initialIntent: 'book a massage on Friday',
      }),
    );
  });

  it('falls back to a phone-derived label when no name is supplied', async () => {
    await post({
      tenantId: TENANT_ID,
      phone: '0825551212',
    });

    expect(mockUpsert).toHaveBeenCalledTimes(1);
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ clientName: 'Visitor 5551212' }),
    );
  });

  it('does NOT upsert a lead when no phone is submitted (email-only)', async () => {
    const res = await post({
      tenantId: TENANT_ID,
      email: 'jane@example.com',
    });
    expect(res.status).toBe(200);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('rejects an invalid tenantId', async () => {
    const res = await post({ phone: '0825551212', tenantId: 'not-a-uuid' });
    expect(res.status).toBe(400);
  });

  it('does not crash when the lead upsert fails (non-blocking)', async () => {
    mockUpsert.mockRejectedValueOnce(new Error('connection refused'));

    const res = await post({
      tenantId: TENANT_ID,
      phone: '0825551212',
      visitorName: 'Test',
    });

    // The route must still return 200 — the lead capture failure is swallowed.
    expect(res.status).toBe(200);
  });
});