// src/lib/reseller/__tests__/seed-tenant-knowledge.test.ts
//
// Phase 4.1 — Post-Creation Provisioning: verifies the modular industry
// lookup table (3–5 items per bucket, safe fallback normalization) and the
// seedTenantDefaults() DB contract (row shape, error surfacing, no-throw for
// bad input).

import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  seedTenantDefaults,
  buildSeedRows,
  normalizeSeedKey,
  INDUSTRY_KNOWLEDGE_SEEDS,
} from '../seed-tenant-knowledge';

interface SeedRow {
  tenant_id: string;
  title: string;
  content: string;
  category: string;
  is_active: boolean;
}

function makeClient(result: { error: { message: string } | null } = { error: null }) {
  const insert = vi.fn().mockResolvedValue(result);
  const from = vi.fn().mockReturnValue({ insert });
  const client = { from } as unknown as SupabaseClient;
  return { client, insert, from };
}

describe('seed-tenant-knowledge', () => {
  // ── Lookup table shape ──────────────────────────────────────────────
  it('exposes 3–5 complete entries for every industry bucket', () => {
    const buckets = Object.entries(INDUSTRY_KNOWLEDGE_SEEDS);
    expect(buckets.length).toBeGreaterThanOrEqual(4); // platform industries + fallback

    for (const [key, entries] of buckets) {
      expect(entries.length, `bucket "${key}"`).toBeGreaterThanOrEqual(3);
      expect(entries.length, `bucket "${key}"`).toBeLessThanOrEqual(5);
      for (const entry of entries) {
        expect(entry.title.length, `${key} title`).toBeGreaterThan(0);
        expect(entry.content.length, `${key} content`).toBeGreaterThan(0);
        expect(entry.category).toBe('faq');
      }
    }
  });

  it('covers the platform industries plus the spec examples and a general fallback', () => {
    for (const key of [
      'automotive',
      'retail',
      'healthcare',
      'insurance',
      'ai_automation',
      'hospitality',
      'real_estate',
      'general',
    ]) {
      expect(INDUSTRY_KNOWLEDGE_SEEDS[key], key).toBeDefined();
    }
  });

  // ── Key normalization ──────────────────────────────────────────────
  it.each([
    ['AUTOMOTIVE', 'automotive'],
    ['ai automation', 'ai_automation'],
    ['AI AUTOMATION', 'ai_automation'],
    ['general business', 'general'],
    ['GENERAL BUSINESS', 'general'],
    ['real_estate', 'real_estate'],
    ['Real Estate', 'real_estate'],
    ['hospitality', 'hospitality'],
  ])('normalizes %o → %s', (input, expected) => {
    expect(normalizeSeedKey(input)).toBe(expected);
  });

  it('falls back to the general bucket for unknown or empty industries', () => {
    expect(normalizeSeedKey('underwater basket weaving')).toBe('general');
    expect(normalizeSeedKey('')).toBe('general');
    expect(normalizeSeedKey('   ')).toBe('general');
  });

  // ── Row building ───────────────────────────────────────────────────
  it('builds base(1) + industry(3) = 4 rows stamped with the tenant id', () => {
    const rows = buildSeedRows('tenant-uuid-1', 'AUTOMOTIVE');
    expect(rows).toHaveLength(4);
    for (const row of rows) {
      expect(row.tenant_id).toBe('tenant-uuid-1');
      expect(row.is_active).toBe(true);
      expect(row.title.length).toBeGreaterThan(0);
      expect(row.content.length).toBeGreaterThan(0);
      expect(row.category).toBe('faq');
    }
    // First row is the universal base entry; the rest come from the bucket.
    expect(rows[0].title).toBe('Contacting This Business');
    expect(rows.slice(1).map((r) => r.title)).toEqual(
      INDUSTRY_KNOWLEDGE_SEEDS.automotive.map((e) => e.title),
    );
  });

  // ── seedTenantDefaults DB contract ─────────────────────────────────
  it('bulk-inserts the mapped rows into tenant_knowledge and reports success', async () => {
    const { client, insert, from } = makeClient();

    const result = await seedTenantDefaults('tenant-uuid-2', 'healthcare', client);

    expect(from).toHaveBeenCalledWith('tenant_knowledge');
    expect(insert).toHaveBeenCalledTimes(1);
    const payload = insert.mock.calls[0][0] as SeedRow[];
    expect(payload).toHaveLength(4);
    expect(payload.every((r) => r.tenant_id === 'tenant-uuid-2')).toBe(true);
    expect(result).toEqual({ seeded: 4, error: null });
  });

  it('surfaces a Postgrest error without throwing', async () => {
    const { client } = makeClient({ error: { message: 'relation does not exist' } });

    const result = await seedTenantDefaults('tenant-uuid-3', 'retail', client);

    expect(result.seeded).toBe(0);
    expect(result.error).toBe('relation does not exist');
  });

  it('rejects a missing tenantId without touching the client', async () => {
    const { client, from } = makeClient();

    const result = await seedTenantDefaults('', 'retail', client);

    expect(from).not.toHaveBeenCalled();
    expect(result.seeded).toBe(0);
    expect(result.error).toBeTruthy();
  });
});
