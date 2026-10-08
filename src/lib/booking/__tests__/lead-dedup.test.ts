// Deterministic suite for the shared appointment-lead upsert helper.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isFallbackName,
  leadPhoneVariants,
  normalizeLeadPhone,
  upsertAppointmentLead,
} from '../lead-dedup';
import { supabaseAdmin } from '@/lib/supabase/admin';

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

const mockedFrom = vi.mocked(supabaseAdmin.from);

function mockLookup(existing: Record<string, unknown> | null) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.in = vi.fn().mockReturnValue(chain);
  chain.order = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.maybeSingle = vi.fn().mockResolvedValue({ data: existing, error: null });
  mockedFrom.mockReturnValueOnce(chain as never);
}

function mockWrite(result: Record<string, unknown> | null) {
  const chain: Record<string, unknown> = {};
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.update = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.select = vi.fn().mockReturnValue(chain);
  chain.maybeSingle = vi.fn().mockResolvedValue({ data: result, error: null });
  mockedFrom.mockReturnValueOnce(chain as never);
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('normalizeLeadPhone', () => {
  it('compacts formatting and strips the leading plus (uniform index key)', () => {
    expect(normalizeLeadPhone('+27 82 123 4567')).toBe('27821234567');
    expect(normalizeLeadPhone('0980987098')).toBe('0980987098');
  });

  it('rejects digit strings outside the valid range', () => {
    expect(normalizeLeadPhone('1234')).toBe(null);
    expect(normalizeLeadPhone('')).toBe(null);
  });
});

describe('leadPhoneVariants', () => {
  it('covers +/- variants so historical rows always match', () => {
    const variants = leadPhoneVariants('+27 82 123 4567');
    expect(variants).toContain('27821234567');
    expect(variants).toContain('+27821234567');
  });

  it('includes the + form even for digits-only input (legacy + rows)', () => {
    // A historical row stored as '+27821234567' must be found by a
    // digits-only lookup, or the upsert inserts a duplicate beside it.
    const variants = leadPhoneVariants('27821234567');
    expect(variants).toContain('27821234567');
    expect(variants).toContain('+27821234567');
  });
});

describe('isFallbackName', () => {
  it('treats Visitor labels as fallbacks and real names as real', () => {
    expect(isFallbackName('Visitor 0987098')).toBe(true);
    expect(isFallbackName(null)).toBe(true);
    expect(isFallbackName('leon')).toBe(false);
  });
});

describe('upsertAppointmentLead', () => {
  it('inserts when no active lead exists for the phone', async () => {
    mockLookup(null);
    const write = mockWrite({
      id: 'new-id',
      client_name: 'leon',
      client_phone: '0980987098',
      initial_intent: 'book asap',
      status: 'LEAD',
      created_at: '2026-10-08T00:00:00.000Z',
    });

    const outcome = await upsertAppointmentLead({
      tenantId: 'tenant-1',
      clientName: 'leon',
      clientPhone: '0980987098',
      initialIntent: 'book asap',
    });

    expect(outcome.deduped).toBe(false);
    expect(outcome.lead?.id).toBe('new-id');
    expect(write.insert).toHaveBeenCalledTimes(1);
  });

  it('canonicalizes a + input to digits-only on insert (uniform index key)', async () => {
    mockLookup(null);
    const write = mockWrite({
      id: 'new-id',
      client_name: 'leon',
      client_phone: '27821234567',
      initial_intent: 'book asap',
      status: 'LEAD',
      created_at: '2026-10-08T00:00:00.000Z',
    });

    const outcome = await upsertAppointmentLead({
      tenantId: 'tenant-1',
      clientName: 'leon',
      clientPhone: '+27 82 123 4567',
      initialIntent: 'book asap',
    });

    expect(outcome.deduped).toBe(false);
    expect(write.insert).toHaveBeenCalledWith(
      expect.objectContaining({ client_phone: '27821234567' }),
    );
  });

  it('updates the existing lead when the same phone repeats (no duplicate)', async () => {
    mockLookup({
      id: 'existing-id',
      client_name: 'Visitor 0987098',
      client_phone: '0980987098',
      initial_intent: 'Public widget inquiry',
      status: 'LEAD',
      created_at: '2026-10-08T00:00:00.000Z',
    });
    const write = mockWrite({
      id: 'existing-id',
      client_name: 'leon',
      client_phone: '0980987098',
      initial_intent: 'book asap',
      status: 'LEAD',
      created_at: '2026-10-08T00:00:00.000Z',
    });

    const outcome = await upsertAppointmentLead({
      tenantId: 'tenant-1',
      clientName: 'leon',
      clientPhone: '0980987098',
      initialIntent: 'book asap',
    });

    expect(outcome.deduped).toBe(true);
    expect(outcome.lead?.id).toBe('existing-id');
    expect(write.update).toHaveBeenCalledWith(
      expect.objectContaining({ client_name: 'leon' }),
    );
    expect(write.insert).not.toHaveBeenCalled();
  });

  it('recovers from a concurrent-insert race via the unique-violation path', async () => {
    // Sibling request won the race: fast-path SELECT sees nothing, INSERT
    // hits the partial unique index, re-query finds the winner.
    mockLookup(null);
    const insertChain: Record<string, unknown> = {};
    insertChain.insert = vi.fn().mockReturnValue(insertChain);
    insertChain.select = vi.fn().mockReturnValue(insertChain);
    insertChain.maybeSingle = vi.fn().mockResolvedValue({
      data: null,
      error: { code: '23505', message: 'duplicate key value' },
    });
    mockedFrom.mockReturnValueOnce(insertChain as never);
    mockLookup({
      id: 'winner-id',
      client_name: 'Visitor 0987098',
      client_phone: '0980987098',
      initial_intent: 'Public widget inquiry',
      status: 'LEAD',
      created_at: '2026-10-08T00:00:00.000Z',
    });
    mockWrite({
      id: 'winner-id',
      client_name: 'keith',
      client_phone: '0980987098',
      initial_intent: 'book asap',
      status: 'LEAD',
      created_at: '2026-10-08T00:00:00.000Z',
    });

    const outcome = await upsertAppointmentLead({
      tenantId: 'tenant-1',
      clientName: 'keith',
      clientPhone: '0980987098',
      initialIntent: 'book asap',
    });

    expect(outcome.deduped).toBe(true);
    expect(outcome.lead?.id).toBe('winner-id');
    expect(outcome.lead?.client_name).toBe('keith');
  });

  it('never overwrites a real name with a phone-derived fallback', async () => {
    mockLookup({
      id: 'existing-id',
      client_name: 'leon',
      client_phone: '0980987098',
      initial_intent: 'book asap',
      status: 'LEAD',
      created_at: '2026-10-08T00:00:00.000Z',
    });

    const outcome = await upsertAppointmentLead({
      tenantId: 'tenant-1',
      clientName: 'Visitor 0987098',
      clientPhone: '0980987098',
      initialIntent: 'book asap',
    });

    expect(outcome.deduped).toBe(true);
    expect(outcome.lead?.client_name).toBe('leon');
    // No write call queued after the lookup — nothing changed.
    expect(mockedFrom).toHaveBeenCalledTimes(1);
  });
});
