import { z } from 'zod';
import type { KnowledgeItem } from '@/lib/reseller/tenant-knowledge-engine';

/**
 * Phase 4.4 — Tenant Knowledge UI helpers (single source of truth).
 *
 * Pure, dependency-free presentation logic shared by the dashboard table and
 * its unit tests: category taxonomy + labels, the add/edit form schema, and
 * list filtering. Transport lives in `./tenant-knowledge-client`.
 */

/** Canonical dashboard categories per the Phase 4.4 spec. */
export const KNOWLEDGE_CATEGORIES = [
  'faq',
  'product',
  'service',
  'policy',
  'general',
] as const;

export type KnowledgeCategory = (typeof KNOWLEDGE_CATEGORIES)[number];

/** Human-readable labels used by the category chip and the filter control. */
export const KNOWLEDGE_CATEGORY_LABELS: Record<KnowledgeCategory, string> = {
  faq: 'FAQ',
  product: 'Product',
  service: 'Service',
  policy: 'Policy',
  general: 'General',
};

/** Filter buckets — `all` disables category filtering. */
export const KNOWLEDGE_FILTER_OPTIONS = ['all', ...KNOWLEDGE_CATEGORIES] as const;

export type KnowledgeFilter = (typeof KNOWLEDGE_FILTER_OPTIONS)[number];

export function isKnowledgeCategory(value: string): value is KnowledgeCategory {
  return (KNOWLEDGE_CATEGORIES as readonly string[]).includes(value);
}

export function isKnowledgeFilter(value: string): value is KnowledgeFilter {
  return (KNOWLEDGE_FILTER_OPTIONS as readonly string[]).includes(value);
}

/**
 * Normalises a raw database category into a canonical bucket.
 * Unknown or blank values collapse to `null` so callers can fall back safely.
 */
export function normalizeKnowledgeCategory(
  raw: string | null | undefined,
): KnowledgeCategory | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().toLowerCase();
  return isKnowledgeCategory(trimmed) ? trimmed : null;
}

/** Display label — unknown or missing categories render as `General`. */
export function knowledgeCategoryLabel(raw: string | null | undefined): string {
  const normalized = normalizeKnowledgeCategory(raw);
  return normalized
    ? KNOWLEDGE_CATEGORY_LABELS[normalized]
    : KNOWLEDGE_CATEGORY_LABELS.general;
}

/** Raw, controlled-input shape held by the add/edit dialog. */
export interface KnowledgeFormDraft {
  title: string;
  content: string;
  category: string;
  is_active: boolean;
}

export const BLANK_KNOWLEDGE_FORM: KnowledgeFormDraft = {
  title: '',
  content: '',
  category: '',
  is_active: true,
};

/**
 * Mirrors the API contract in `app/api/reseller/tenant-knowledge/route.ts`:
 * title 1–500, category ≤ 200, `is_active` boolean. `content` additionally
 * carries a defensive client-side paste guard, because the API declares no
 * upper bound for it.
 *
 * Categories are trimmed, lower-cased, and collapsed to `null` when blank so
 * stored values stay directly comparable with the filter buckets.
 */
export const KnowledgeFormSchema = z.object({
  title: z
    .string({ invalid_type_error: 'Title must be text' })
    .trim()
    .min(1, 'Title is required')
    .max(500, 'Title must be 500 characters or fewer'),
  content: z
    .string({ invalid_type_error: 'Content must be text' })
    .trim()
    .min(1, 'Content is required')
    .max(20000, 'Content must be 20000 characters or fewer'),
  category: z
    .string({ invalid_type_error: 'Category must be text' })
    .trim()
    .max(200, 'Category must be 200 characters or fewer')
    .optional()
    .default('')
    .transform((value) => (value.length > 0 ? value.toLowerCase() : null)),
  is_active: z
    .boolean({ invalid_type_error: 'Active must be true or false' })
    .default(true),
});

/** Validated output shape — `category` is already collapsed to `string | null`. */
export type KnowledgeFormValues = z.infer<typeof KnowledgeFormSchema>;

export function validateKnowledgeForm(
  values: unknown,
): { ok: true; values: KnowledgeFormValues } | { ok: false; errors: string[] } {
  const parsed = KnowledgeFormSchema.safeParse(values);
  if (parsed.success) return { ok: true, values: parsed.data };
  return {
    ok: false,
    errors: parsed.error.issues.map((issue) => issue.message),
  };
}

/** Shared text-input styling for the knowledge toolbar and dialogs. */
export const KNOWLEDGE_FIELD_CLASS =
  'w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white placeholder:text-white/40 outline-none transition-colors focus:border-cyan-500';

/**
 * Client-side filtering for the table: case-insensitive title/content match
 * plus an exact category bucket.
 *
 * - `'all'` disables the category filter.
 * - Rows with no category are bucketed as `general` (matching the badge).
 * - The bucket is compared against the row's own category, lower-cased and
 *   trimmed. A custom (non-canonical) category therefore only surfaces under
 *   `all` — or when its literal bucket is requested — and is never folded into
 *   `general`.
 */
export function filterKnowledgeItems(
  items: KnowledgeItem[],
  search: string,
  category: string,
): KnowledgeItem[] {
  const needle = search.trim().toLowerCase();
  const bucket = category.trim().toLowerCase();

  return items.filter((item) => {
    if (bucket !== 'all') {
      const itemBucket = (item.category ?? 'general').trim().toLowerCase();
      if (itemBucket !== bucket) return false;
    }
    if (!needle) return true;
    return (
      item.title.toLowerCase().includes(needle) ||
      item.content.toLowerCase().includes(needle)
    );
  });
}
