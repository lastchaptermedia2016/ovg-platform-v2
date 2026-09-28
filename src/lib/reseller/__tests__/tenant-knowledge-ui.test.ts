// src/lib/reseller/__tests__/tenant-knowledge-ui.test.ts
//
// Phase 4.4 — Tenant Knowledge UI helpers:
//   - canonical category taxonomy, labels, and safe fallbacks
//   - add/edit form validation: trimming, blank-category collapse, lower-casing,
//     length limits, and type rejection
//   - list filtering: case-insensitive title/content search plus an exact
//     category bucket, with uncategorised rows bucketed as `general`

import { describe, it, expect } from 'vitest';
import {
  BLANK_KNOWLEDGE_FORM,
  KNOWLEDGE_CATEGORIES,
  KNOWLEDGE_CATEGORY_LABELS,
  KNOWLEDGE_FILTER_OPTIONS,
  filterKnowledgeItems,
  isKnowledgeCategory,
  isKnowledgeFilter,
  knowledgeCategoryLabel,
  normalizeKnowledgeCategory,
  validateKnowledgeForm,
} from '../tenant-knowledge-ui';
import type { KnowledgeItem } from '../tenant-knowledge-engine';

function makeItem(overrides: Partial<KnowledgeItem> = {}): KnowledgeItem {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    tenant_id: '22222222-2222-4222-8222-222222222222',
    title: 'Business Hours',
    content: 'We are open Monday to Friday, 9am to 5pm.',
    category: 'faq',
    is_active: true,
    ...overrides,
  };
}

describe('tenant-knowledge-ui taxonomy', () => {
  it('exposes the five canonical categories in spec order', () => {
    expect(KNOWLEDGE_CATEGORIES).toEqual(['faq', 'product', 'service', 'policy', 'general']);
  });

  it('builds the filter list with an `all` bucket first', () => {
    expect(KNOWLEDGE_FILTER_OPTIONS).toHaveLength(6);
    expect(KNOWLEDGE_FILTER_OPTIONS[0]).toBe('all');
  });

  it('labels every canonical category', () => {
    for (const category of KNOWLEDGE_CATEGORIES) {
      expect(KNOWLEDGE_CATEGORY_LABELS[category]).toBeTruthy();
    }
  });

  it('normalises raw categories into canonical buckets', () => {
    expect(normalizeKnowledgeCategory('  FAQ ')).toBe('faq');
    expect(normalizeKnowledgeCategory('Policy')).toBe('policy');
    expect(normalizeKnowledgeCategory('pricing')).toBeNull();
    expect(normalizeKnowledgeCategory('')).toBeNull();
    expect(normalizeKnowledgeCategory(null)).toBeNull();
    expect(normalizeKnowledgeCategory(undefined)).toBeNull();
  });

  it('falls back to General for unknown or missing categories', () => {
    expect(knowledgeCategoryLabel('faq')).toBe('FAQ');
    expect(knowledgeCategoryLabel('  SERVICE ')).toBe('Service');
    expect(knowledgeCategoryLabel('pricing')).toBe('General');
    expect(knowledgeCategoryLabel(null)).toBe('General');
  });

  it('guards the category and filter union types', () => {
    expect(isKnowledgeCategory('policy')).toBe(true);
    expect(isKnowledgeCategory('pricing')).toBe(false);
    expect(isKnowledgeFilter('all')).toBe(true);
    expect(isKnowledgeFilter('general')).toBe(true);
    expect(isKnowledgeFilter('pricing')).toBe(false);
  });

  it('ships a blank draft that files new entries as active + uncategorised', () => {
    expect(BLANK_KNOWLEDGE_FORM).toEqual({
      title: '',
      content: '',
      category: '',
      is_active: true,
    });
  });
});

function expectErrors(values: unknown): string[] {
  const result = validateKnowledgeForm(values);
  expect(result.ok).toBe(false);
  return result.ok ? [] : result.errors;
}

function expectValues(values: unknown): { title: string; content: string; category: string | null; is_active: boolean } {
  const result = validateKnowledgeForm(values);
  if (!result.ok) {
    throw new Error(`expected a valid form, received: ${result.errors.join('; ')}`);
  }
  return result.values;
}

describe('validateKnowledgeForm', () => {
  it('rejects the blank draft with field-level messages', () => {
    const errors = expectErrors(BLANK_KNOWLEDGE_FORM);

    expect(errors).toContain('Title is required');
    expect(errors).toContain('Content is required');
  });

  it('trims the payload and collapses a blank category to null', () => {
    const values = expectValues({
      title: '  Business hours  ',
      content: '  Open 9am to 5pm.  ',
      category: '   ',
      is_active: true,
    });

    expect(values).toEqual({
      title: 'Business hours',
      content: 'Open 9am to 5pm.',
      category: null,
      is_active: true,
    });
  });

  it('trims and lower-cases an explicit category', () => {
    const values = expectValues({
      title: 'Returns',
      content: 'Unused items may be returned within 30 days.',
      category: '  POLICY  ',
      is_active: false,
    });

    expect(values.category).toBe('policy');
    expect(values.is_active).toBe(false);
  });

  it('defaults a missing is_active flag to true', () => {
    const values = expectValues({ title: 'Hours', content: '9am to 5pm.' });

    expect(values.is_active).toBe(true);
  });

  it('rejects a title longer than 500 characters', () => {
    const errors = expectErrors({
      title: 'a'.repeat(501),
      content: 'Valid content.',
      is_active: true,
    });

    expect(errors).toEqual(['Title must be 500 characters or fewer']);
  });

  it('rejects a category longer than 200 characters', () => {
    const errors = expectErrors({
      title: 'Hours',
      content: 'Valid content.',
      category: 'c'.repeat(201),
      is_active: true,
    });

    expect(errors).toEqual(['Category must be 200 characters or fewer']);
  });

  it('rejects a non-boolean is_active value', () => {
    const errors = expectErrors({
      title: 'Hours',
      content: 'Valid content.',
      category: '',
      is_active: 'yes',
    });

    expect(errors).toEqual(['Active must be true or false']);
  });

  it('rejects non-object input without throwing', () => {
    expect(validateKnowledgeForm(null).ok).toBe(false);
    expect(validateKnowledgeForm('not a form').ok).toBe(false);
  });
});

describe('filterKnowledgeItems', () => {
  const faq = makeItem({ id: 'row-a', title: 'Business Hours' });
  const policy = makeItem({
    id: 'row-b',
    title: 'Returns Policy',
    content: 'Unused items may be returned within 30 days.',
    category: 'policy',
  });
  const uncategorised = makeItem({
    id: 'row-c',
    title: 'Parking',
    content: 'Free parking is available behind the building.',
    category: null,
  });
  const custom = makeItem({
    id: 'row-d',
    title: 'Warranty',
    content: 'Twelve month warranty on all workmanship.',
    category: 'pricing',
  });
  const rows = [faq, policy, uncategorised, custom];
  const ids = (result: KnowledgeItem[]): string[] => result.map((item) => item.id);

  it('returns every row for the `all` bucket with no search term', () => {
    expect(ids(filterKnowledgeItems(rows, '', 'all'))).toEqual([
      'row-a',
      'row-b',
      'row-c',
      'row-d',
    ]);
    expect(filterKnowledgeItems(rows, '   ', 'all')).toHaveLength(4);
  });

  it('filters to an exact category bucket', () => {
    expect(ids(filterKnowledgeItems(rows, '', 'policy'))).toEqual(['row-b']);
  });

  it('buckets uncategorised rows as general', () => {
    expect(ids(filterKnowledgeItems(rows, '', 'general'))).toEqual(['row-c']);
  });

  it('keeps custom categories out of the canonical buckets but matches them literally', () => {
    expect(ids(filterKnowledgeItems(rows, '', 'faq'))).toEqual(['row-a']);
    expect(ids(filterKnowledgeItems(rows, '', 'pricing'))).toEqual(['row-d']);
  });

  it('matches the search term against the title, case-insensitively', () => {
    expect(ids(filterKnowledgeItems(rows, 'RETURNS', 'all'))).toEqual(['row-b']);
  });

  it('matches the search term against the content, case-insensitively', () => {
    expect(ids(filterKnowledgeItems(rows, 'parking', 'all'))).toEqual(['row-c']);
  });

  it('normalises the bucket casing before comparing', () => {
    const upper = makeItem({
      id: 'row-e',
      title: 'Shipping',
      content: 'Next day delivery is available.',
      category: 'POLICY',
    });

    expect(filterKnowledgeItems([upper], '', '  Policy  ')).toHaveLength(1);
  });

  it('combines the search term with the category bucket', () => {
    expect(ids(filterKnowledgeItems(rows, 'policy', 'policy'))).toEqual(['row-b']);
    expect(filterKnowledgeItems(rows, 'parking', 'faq')).toEqual([]);
  });

  it('returns an empty list when nothing matches', () => {
    expect(filterKnowledgeItems(rows, 'nonexistent-term', 'all')).toEqual([]);
  });

  it('does not mutate the input array', () => {
    const snapshot = [...rows];

    filterKnowledgeItems(rows, 'returns', 'policy');

    expect(rows).toEqual(snapshot);
  });
});
