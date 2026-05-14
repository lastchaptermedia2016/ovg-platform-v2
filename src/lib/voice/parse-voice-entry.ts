/**
 * Universal Voice Entry — Deterministic Parser
 *
 * Zero-dependency, ultra-performant module that translates raw STT
 * transcription text into structured CRM client data.
 *
 * Designed for Next.js Server Actions / Edge Functions.
 *
 * ── Parsing Strategy ─────────────────────────────────────────────
 *  1. Delimiter detection  (| , ;)  → structured split
 *  2. Regex pattern match            → "create client X in industry Y"
 *  3. Full-string fallback           → conversational noise → name field
 *
 * @module parse-voice-entry
 */

import type { VoiceParseResult, VoiceParseCategory } from '@/types/voice-parser';

// ─── Constants ───────────────────────────────────────────────────

const DELIMITERS = ['|', ',', ';'] as const;

/**
 * Industry-to-category mapping — deterministic string matching.
 * Keys are lowercased for case-insensitive comparison.
 */
const INDUSTRY_CATEGORY_MAP: Record<string, VoiceParseCategory> = {
  // Automotive tier
  auto: 'AUTOMOTIVE_ELITE',
  automotive: 'AUTOMOTIVE_ELITE',
  car: 'AUTOMOTIVE_ELITE',
  cars: 'AUTOMOTIVE_ELITE',
  dealer: 'AUTOMOTIVE_ELITE',
  dealership: 'AUTOMOTIVE_ELITE',
  mechanic: 'AUTOMOTIVE_ELITE',
  garage: 'AUTOMOTIVE_ELITE',
  'auto repair': 'AUTOMOTIVE_ELITE',
  'car wash': 'AUTOMOTIVE_ELITE',
  'tire shop': 'AUTOMOTIVE_ELITE',
  'body shop': 'AUTOMOTIVE_ELITE',
  'auto parts': 'AUTOMOTIVE_ELITE',
  'auto detailing': 'AUTOMOTIVE_ELITE',
  vehicles: 'AUTOMOTIVE_ELITE',
  'electric vehicles': 'AUTOMOTIVE_ELITE',
  ev: 'AUTOMOTIVE_ELITE',
  motor: 'AUTOMOTIVE_ELITE',
  motors: 'AUTOMOTIVE_ELITE',
  // Retail tier
  retail: 'RETAIL_STANDARD',
  shop: 'RETAIL_STANDARD',
  store: 'RETAIL_STANDARD',
  boutique: 'RETAIL_STANDARD',
  ecommerce: 'RETAIL_STANDARD',
  'e-commerce': 'RETAIL_STANDARD',
  'online store': 'RETAIL_STANDARD',
  marketplace: 'RETAIL_STANDARD',
  clothing: 'RETAIL_STANDARD',
  fashion: 'RETAIL_STANDARD',
  grocery: 'RETAIL_STANDARD',
  supermarket: 'RETAIL_STANDARD',
  restaurant: 'RETAIL_STANDARD',
  cafe: 'RETAIL_STANDARD',
  bakery: 'RETAIL_STANDARD',
  bar: 'RETAIL_STANDARD',
  salon: 'RETAIL_STANDARD',
  spa: 'RETAIL_STANDARD',
};

// ─── Helpers ─────────────────────────────────────────────────────

/**
 * Resolve a raw industry string into a VoiceParseCategory.
 * Case-insensitive; falls back to GENERAL if no match found.
 */
function resolveCategory(rawIndustry: string): VoiceParseCategory {
  const cleaned = rawIndustry.trim().toLowerCase();
  if (!cleaned) return 'GENERAL';

  // Exact match first (fast path)
  const exact = INDUSTRY_CATEGORY_MAP[cleaned];
  if (exact) return exact;

  // Partial match
  for (const [key, category] of Object.entries(INDUSTRY_CATEGORY_MAP)) {
    if (cleaned.includes(key) || key.includes(cleaned)) {
      return category;
    }
  }

  return 'GENERAL';
}

/**
 * Extract the first capture group from a regex match.
 * Returns the trimmed string or empty string if absent.
 */
function group(match: RegExpMatchArray, idx: number): string {
  return (match[idx] ?? '').trim();
}

// ─── Parsing Phases ──────────────────────────────────────────────

/**
 * Phase 1 — Delimiter Detection.
 * Attempts to split by | , or ;. Returns null if no delimiter found.
 */
function parseByDelimiter(raw: string): VoiceParseResult | null {
  const trimmed = raw.trim();

  let bestDelim: string | null = null;
  let bestIndex = Infinity;

  for (const d of DELIMITERS) {
    const idx = trimmed.indexOf(d);
    if (idx !== -1 && idx < bestIndex) {
      bestDelim = d;
      bestIndex = idx;
    }
  }

  if (!bestDelim) return null;

  const segments = trimmed.split(bestDelim).map((s) => s.trim()).filter(Boolean);
  if (segments.length === 0) return null;

  const name = segments[0]!;
  const industry = segments.length >= 2 ? segments[1]! : '';
  const category = resolveCategory(industry);

  // confidence: 1.0 if industry explicitly matched a non-GENERAL key, 0.8 if defaulted
  const confidence = industry && category !== 'GENERAL' ? 1.0 : 0.8;

  return {
    name,
    industry: industry || 'GENERAL',
    category,
    meta: { parserFoundDelimiters: true, confidence },
  };
}

/**
 * Phase 2 — Regex Pattern Matching.
 * Handles natural-language patterns like "create client ... in industry ...".
 * Returns null if no pattern matches.
 *
 * NOTE: Named capture groups require ES2018+. To remain compatible with
 * ES2017 (the project target), all capture groups use numbered indices.
 *   $1 = name   $2 (optional) = industry
 */
function parseByPattern(raw: string): VoiceParseResult | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Pattern definitions using numbered capture groups for ES2017 compatibility.
  // Each entry: [regex, has_industry_flag]
  //   $1 always = name
  //   $2 (if flag=true) = industry
  type PatternEntry = { regex: RegExp; hasIndustry: boolean };

  const PATTERNS: PatternEntry[] = [
    // "create/add new client/business X in/for/as Y industry/sector"
    {
      regex: /(?:create|add|register|make|set\s+up|start)\s+(?:a\s+|new\s+)?(?:client|business|company|firm|account|record)\s+(?:called\s+|named\s+)?(.+?)\s+(?:in|for|as|at|under|within)\s+(?:the\s+)?(?:industry\s+|sector\s+)?(.+)/i,
      hasIndustry: true,
    },
    // "create/add client X" (no industry) — only match if the remainder doesn't look like an industry clause
    {
      regex: /(?:create|add|register|make)\s+(?:a\s+|new\s+)?(?:client|business|company|firm|account)\s+(?:called\s+|named\s+)?(.+)/i,
      hasIndustry: false,
    },
    // "X in Y industry" (short pattern from start of string) — requires one of the known industry keywords
    {
      regex: /^(.+?)\s+(?:in|for|as|at)\s+(?:the\s+)?(automotive|retail|auto|car|dealer|garage|shop|restaurant|salon|spa|ecommerce|healthcare|insurance)(?:\s+(?:industry|sector|business))?$/i,
      hasIndustry: true,
    },
    // "X — Y" or "X - Y" or "X – Y" (hyphen delimiter — common in dictation)
    {
      regex: /^(.+)\s*[-–—]\s*(.+)/i,
      hasIndustry: true,
    },
  ];

  for (const { regex, hasIndustry } of PATTERNS) {
    const match = trimmed.match(regex);
    if (!match) continue;

    const name = group(match, 1);
    if (!name) continue;

    let industry = '';
    let category: VoiceParseCategory;

    if (hasIndustry) {
      industry = group(match, 2);
      category = resolveCategory(industry);
    } else {
      category = 'GENERAL';
    }

    const confidence = industry && category !== 'GENERAL' ? 0.5 : 0.3;

    return {
      name,
      industry: industry || 'GENERAL',
      category,
      meta: { parserFoundDelimiters: false, confidence },
    };
  }

  return null;
}

// ─── Public API ──────────────────────────────────────────────────

/**
 * Parse a raw STT transcription string into structured CRM client data.
 *
 * Deterministic, zero-dependency, O(n) in transcription length.
 * Designed to be called from Server Actions or Edge Functions with
 * no external API calls, no LLM overhead, no runtime dependencies.
 *
 * @param raw - The raw transcription string from STT.
 * @returns A VoiceParseResult containing extracted name, industry,
 *          category, and confidence metadata.
 *
 * @example
 * ```ts
 * parseVoiceEntry('Acme Motors | automotive')
 * // => { name: 'Acme Motors', industry: 'automotive', category: 'AUTOMOTIVE_ELITE', meta: { parserFoundDelimiters: true, confidence: 1.0 } }
 *
 * parseVoiceEntry('Hannah is asking the correct questions')
 * // => { name: 'Hannah is asking the correct questions', industry: 'GENERAL', category: 'GENERAL', meta: { parserFoundDelimiters: false, confidence: 0.1 } }
 * ```
 */
export function parseVoiceEntry(raw: string): VoiceParseResult {
  // ── Guard: Empty input ────────────────────────────────────────
  const trimmed = raw?.trim() ?? '';
  if (!trimmed) {
    return {
      name: '',
      industry: 'GENERAL',
      category: 'GENERAL',
      meta: { parserFoundDelimiters: false, confidence: 0 },
    };
  }

  // ── Phase 1: Delimiter Parse (fast path, highest confidence) ──
  const delimiterResult = parseByDelimiter(trimmed);
  if (delimiterResult) return delimiterResult;

  // ── Phase 2: Regex Pattern Match ──────────────────────────────
  const patternResult = parseByPattern(trimmed);
  if (patternResult) return patternResult;

  // ── Phase 3: Full-String Fallback (conversational noise guard) ─
  // If none of the patterns matched, the entire utterance is treated
  // as the client name. Gracefully handles conversational noise.
  return {
    name: trimmed,
    industry: 'GENERAL',
    category: 'GENERAL',
    meta: { parserFoundDelimiters: false, confidence: 0.1 },
  };
}