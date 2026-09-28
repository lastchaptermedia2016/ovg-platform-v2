// src/lib/reseller/__tests__/tenant-knowledge-engine.test.ts
//
// Phase 4.2 — Knowledge Retrieval Engine:
//   - formatted Markdown context for active entries
//   - empty context when no records exist (error: null)
//   - Postgrest errors and thrown failures resolve as `error`, never throw
//   - strict tenant_id / is_active scoping on every query

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  getTenantKnowledgeContext,
  formatKnowledgeContext,
  type KnowledgeItem,
} from '../tenant-knowledge-engine';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';

function makeItem(overrides: Partial<KnowledgeItem> = {}): KnowledgeItem {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    tenant_id: TENANT_ID,
    title: 'Business Hours',
    content: 'We are open Monday to Friday, 9am to 5pm.',
    category: 'faq',
    is_active: true,
    ...overrides,
  };
}

interface Harness {
  client: SupabaseClient;
  fromCalls: string[];
  eqCalls: Array<[string, unknown]>;
  setOrderResult: (result: Promise<{ data: unknown; error: unknown }>) => void;
}

function makeHarness(
  initial: { data: unknown; error: unknown } = { data: [], error: null },
): Harness {
  const fromCalls: string[] = [];
  const eqCalls: Array<[string, unknown]> = [];
  let orderResult = Promise.resolve(initial);

  const chain: Record<string, unknown> = {};
  chain.from = vi.fn().mockImplementation((table: string) => {
    fromCalls.push(table);
    return chain;
  });
  chain.select = vi.fn().mockImplementation(() => chain);
  chain.eq = vi.fn().mockImplementation((column: string, value: unknown) => {
    eqCalls.push([column, value]);
    return chain;
  });
  chain.order = vi.fn().mockImplementation(() => orderResult);

  return {
    client: chain as unknown as SupabaseClient,
    fromCalls,
    eqCalls,
    setOrderResult: (result) => {
      orderResult = result;
    },
  };
}

describe('tenant-knowledge-engine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('formats active entries into a Markdown Q/A context block', async () => {
    const rows = [
      makeItem(),
      makeItem({
        id: '33333333-3333-4333-8333-333333333333',
        title: 'Parking',
        content: 'Free parking is available behind the building.',
      }),
    ];
    const harness = makeHarness({ data: rows, error: null });

    const result = await getTenantKnowledgeContext(TENANT_ID, harness.client);

    expect(result.error).toBeNull();
    expect(result.items).toHaveLength(2);
    expect(result.contextString).toBe(
      '### Q: Business Hours\nA: We are open Monday to Friday, 9am to 5pm.' +
        '\n\n' +
        '### Q: Parking\nA: Free parking is available behind the building.',
    );
  });

  it('scopes every query by tenant_id and is_active = true', async () => {
    const harness = makeHarness({ data: [], error: null });

    await getTenantKnowledgeContext(TENANT_ID, harness.client);

    expect(harness.fromCalls).toEqual(['tenant_knowledge']);
    expect(harness.eqCalls).toEqual([
      ['tenant_id', TENANT_ID],
      ['is_active', true],
    ]);
  });

  it('returns an empty context with error null when no active rows exist', async () => {
    const harness = makeHarness({ data: [], error: null });

    const result = await getTenantKnowledgeContext(TENANT_ID, harness.client);

    expect(result).toEqual({ contextString: '', items: [], error: null });
  });

  it('surfaces Postgrest errors without throwing', async () => {
    const harness = makeHarness({ data: null, error: { message: 'permission denied' } });

    const result = await getTenantKnowledgeContext(TENANT_ID, harness.client);

    expect(result.contextString).toBe('');
    expect(result.items).toEqual([]);
    expect(result.error).toBe('permission denied');
  });

  it('captures thrown failures as error instead of throwing', async () => {
    const harness = makeHarness();
    harness.setOrderResult(Promise.reject(new Error('network down')));

    const result = await getTenantKnowledgeContext(TENANT_ID, harness.client);

    expect(result.contextString).toBe('');
    expect(result.items).toEqual([]);
    expect(result.error).toBe('network down');
  });

  it('rejects an empty tenantId without touching the client', async () => {
    const harness = makeHarness();

    const result = await getTenantKnowledgeContext('', harness.client);

    expect(harness.fromCalls).toEqual([]);
    expect(result.contextString).toBe('');
    expect(result.error).toBe('tenantId is required');
  });

  it('applies the optional category filter as a tenant-scoped predicate', async () => {
    const harness = makeHarness({ data: [], error: null });

    await getTenantKnowledgeContext(TENANT_ID, harness.client, { category: 'policies' });

    expect(harness.eqCalls).toEqual([
      ['tenant_id', TENANT_ID],
      ['is_active', true],
      ['category', 'policies'],
    ]);
  });

  it('filters items in-memory by the optional query across title and content', async () => {
    const rows = [
      makeItem(),
      makeItem({
        id: '44444444-4444-4444-8444-444444444444',
        title: 'Returns Policy',
        content: 'Unused items may be returned within 30 days.',
      }),
    ];
    const harness = makeHarness({ data: rows, error: null });

    const result = await getTenantKnowledgeContext(TENANT_ID, harness.client, {
      query: 'RETURNS',
    });

    expect(result.error).toBeNull();
    expect(result.items).toHaveLength(1);
    expect(result.items[0].title).toBe('Returns Policy');
    expect(result.contextString).not.toContain('Business Hours');
  });

  it('formatKnowledgeContext returns an empty string for an empty list', () => {
    expect(formatKnowledgeContext([])).toBe('');
  });
});
