/**
 * Shared industry normalization for the client-creation pipeline.
 *
 * A single source of truth for mapping arbitrary industry strings (voice
 * transcripts, wizard enums, AI extractions) onto values accepted by the
 * `industry_check` SQL constraint on `tenants.industry`
 * (migration `20260918000001_add_missing_tenant_columns.sql`):
 *
 *   CHECK (industry IN (
 *     'automotive', 'general', 'retail', 'healthcare',
 *     'real_estate', 'hospitality',
 *     'AUTOMOTIVE', 'GENERAL BUSINESS', 'RETAIL', 'HEALTHCARE',
 *     'INSURANCE', 'AI AUTOMATION'
 *   ))
 *
 * The application layer standardizes on the UPPERCASE half of that list.
 * Note: uppercase 'GENERAL' is NOT accepted by the constraint — it must be
 * normalized to 'GENERAL BUSINESS'.
 */

/** Canonical, DB-compliant industry values used across the platform. */
export const DB_INDUSTRY_VALUES = [
  'AUTOMOTIVE',
  'RETAIL',
  'HEALTHCARE',
  'INSURANCE',
  'AI AUTOMATION',
  'GENERAL BUSINESS',
] as const;

export type DbIndustry = (typeof DB_INDUSTRY_VALUES)[number];

/**
 * Fuzzy aliases → canonical value.
 *
 * Order matters: longer/more specific needles must precede short generic
 * ones (e.g. 'AUTOMATION' before 'AUTO') because matching uses `includes`.
 * Short needles (≤ 3 chars, e.g. 'AI', 'CAR') are matched with word
 * boundaries to avoid false positives such as 'ENTERTAINMENT' ⊃ 'AI'.
 */
const FUZZY_ALIASES: ReadonlyArray<readonly [needle: string, value: DbIndustry]> = [
  // Insurance
  ['INSURANCE', 'INSURANCE'],
  ['INSURENS', 'INSURANCE'],
  ['INSURE', 'INSURANCE'],
  ['INSUR', 'INSURANCE'],
  // Healthcare (before automotive needles: 'healthcare' contains 'car')
  ['HEALTHCARE', 'HEALTHCARE'],
  ['HEALTH CARE', 'HEALTHCARE'],
  ['MEDICAL', 'HEALTHCARE'],
  ['HEALTH', 'HEALTHCARE'],
  // AI / automation (before 'AUTO': 'automation' contains 'auto')
  ['AI AUTOMATION', 'AI AUTOMATION'],
  ['ARTIFICIAL INTELLIGENCE', 'AI AUTOMATION'],
  ['AUTOMATION', 'AI AUTOMATION'],
  ['CHATBOT', 'AI AUTOMATION'],
  // Automotive
  ['AUTOMOTIVE', 'AUTOMOTIVE'],
  ['AUTOMOBILE', 'AUTOMOTIVE'],
  ['VEHICLE', 'AUTOMOTIVE'],
  ['AUTO', 'AUTOMOTIVE'],
  ['CAR', 'AUTOMOTIVE'],
  // Retail
  ['RETAIL', 'RETAIL'],
  ['ECOMMERCE', 'RETAIL'],
  ['E-COMMERCE', 'RETAIL'],
  ['STORE', 'RETAIL'],
  ['SHOP', 'RETAIL'],
  // Verticals without a dedicated enum value → general bucket
  ['REAL ESTATE', 'GENERAL BUSINESS'],
  ['REAL_ESTATE', 'GENERAL BUSINESS'],
  ['HOSPITALITY', 'GENERAL BUSINESS'],
  ['GENERAL BUSINESS', 'GENERAL BUSINESS'],
  ['GENERAL', 'GENERAL BUSINESS'],
  ['BUSINESS', 'GENERAL BUSINESS'],
  ['CONSULTING', 'GENERAL BUSINESS'],
  ['SERVICES', 'GENERAL BUSINESS'],
  ['OTHER', 'GENERAL BUSINESS'],
];

function matchesNeedle(normalized: string, needle: string): boolean {
  if (needle.length <= 3) {
    // Word-boundary match for short needles ('AI', 'CAR') so they cannot
    // fire inside unrelated words.
    return new RegExp(`\\b${needle}\\b`).test(normalized);
  }
  return normalized.includes(needle);
}

/**
 * Normalize any industry input to a DB-compliant canonical value.
 *
 * Idempotent: canonical values pass through unchanged. Unknown or empty
 * inputs fall back to 'GENERAL BUSINESS' so inserts never violate
 * `industry_check` (23514).
 *
 * @param industry - Raw industry string (e.g. 'general', 'Healthcare', '').
 * @returns One of {@link DB_INDUSTRY_VALUES}.
 */
export function normalizeIndustry(industry: string): string {
  const normalized = industry.trim().replace(/\s+/g, ' ').toUpperCase();

  if (!normalized) return 'GENERAL BUSINESS';

  if ((DB_INDUSTRY_VALUES as readonly string[]).includes(normalized)) {
    return normalized;
  }

  for (const [needle, value] of FUZZY_ALIASES) {
    if (matchesNeedle(normalized, needle)) {
      return value;
    }
  }

  return 'GENERAL BUSINESS';
}
