/**
 * @file client-routes.ts
 *
 * Single source of truth for ZEEDER client-surface navigation targets.
 *
 * Why this exists:
 *   The Studio viewports are four SIBLING ROUTES under one layout
 *   (`src/app/client/dashboard/studio/layout.tsx` renders the nav cards and
 *   derives the active card by exact `usePathname()` equality). Before this
 *   module, the four paths were hardcoded — and inconsistently — in half a
 *   dozen files, so a voice command whose target got dropped mid-pipeline
 *   silently fell back to a hardcoded Branding default.
 *
 * Every path here is verified against the real `src/app/client/**` page tree.
 * A stale path is not a soft failure — `router.push('/client/knowledge')`
 * renders a 404, so this module never emits a path it cannot justify.
 *
 * Deliberately a PURE LEAF: no imports, no React, no server-only code. It is
 * consumed by the server route (`/api/client/process-command`) and by the
 * `'use client'` voice hook, so it must stay isomorphic.
 */

/** Route prefix shared by all four Studio viewports. */
export const CLIENT_STUDIO_BASE = '/client/dashboard/studio';

/**
 * The four real Studio viewports, in nav-card order.
 *
 * `analytics` is intentionally ABSENT: there is no analytics page, so a
 * request for one must be answered by the telemetry action rather than a
 * navigation. Adding a tab here without adding a matching `page.tsx` would
 * turn a voice command into a 404.
 */
export const CLIENT_STUDIO_TABS = ['branding', 'persona', 'knowledge', 'integrations'] as const;

/** One of {@link CLIENT_STUDIO_TABS}. */
export type ClientStudioTab = (typeof CLIENT_STUDIO_TABS)[number];

/** The client dashboard landing route. */
export const CLIENT_DASHBOARD_HREF = '/client/dashboard';

/**
 * Build the route for a Studio viewport, e.g. `clientStudioHref('knowledge')`
 * → `/client/dashboard/studio/knowledge`.
 */
export function clientStudioHref(tab: ClientStudioTab): string {
  return `${CLIENT_STUDIO_BASE}/${tab}`;
}

/**
 * Type guard for an untrusted `tab` value arriving on a JSON payload. The
 * registry/hook read this straight off `data.payload`, so it must never
 * assume the value is a valid tab.
 */
export function isClientStudioTab(value: unknown): value is ClientStudioTab {
  return typeof value === 'string' && (CLIENT_STUDIO_TABS as readonly string[]).includes(value);
}

/**
 * Explicit navigation phrasings. These are verbs that mean "show me that
 * screen".
 *
 * Mutation verbs ("update", "change", "set", "apply") are deliberately absent:
 * "update my branding" is a `SYSTEM_UPDATE_BRANDING` command, not a request to
 * navigate, and hijacking it would break the branding-edit flow.
 */
const NAVIGATION_INTENTS: readonly RegExp[] = [
  /\bgo\s?to\b/,
  /\bnavigate\s+to\b/,
  /\bopen\b/,
  /\bshow\s+me\b/,
  /\bshow\b/,
  /\btake\s+me\b/,
  /\bjump\s+to\b/,
  /\bswitch\s+to\b/,
  /\bmove\s+to\b/,
  /\bvisit\b/,
  /\bhead\s+(?:to|over\s+to|back\s+to)\b/,
  /\bbring\s+up\b/,
  /\bpull\s+up\b/,
  /\bload\b/,
  /\bget\s+to\b/,
  /\bwhere\s+is\b/,
  /\bwhere\s+can\s+i\b/,
  /\bi\s+need\b/,
];

/**
 * True when the utterance contains an explicit navigation verb.
 *
 * @example hasNavigationIntent('take me to the knowledge page') // true
 * @example hasNavigationIntent('update my branding')            // false
 */
export function hasNavigationIntent(text: string): boolean {
  const lower = text.toLowerCase();
  return NAVIGATION_INTENTS.some((pattern) => pattern.test(lower));
}

/**
 * Keyword groups per Studio viewport, most specific phrases first.
 *
 * Order matters: `resolveClientStudioTab` consumes the longest phrase match
 * at a given position before shorter ones, so "knowledge base" wins over
 * "knowledge" and "visual identity" is claimed by branding before the
 * persona-only "voice"/"personality" words are considered.
 */
const TAB_KEYWORDS: Readonly<Record<ClientStudioTab, readonly string[]>> = {
  branding: [
    'visual identity',
    'branding',
    'brand',
    'logo',
    'logos',
    'color',
    'colors',
    'colour',
    'colours',
    'theme',
    'themes',
    'styling',
    'style',
    'design',
    'font',
    'fonts',
    'header',
    'footer',
    'widget',
  ],
  persona: [
    'persona',
    'personas',
    'ai voice',
    'assistant voice',
    'tone',
    'voice',
    'greeting',
    'personality',
    'behaviour',
    'behavior',
  ],
  knowledge: [
    'knowledge base',
    'knowledge',
    'faq',
    'faqs',
    'policies',
    'policy',
    'training',
    'manual',
    'manuals',
    'documents',
    'document',
    'playbook',
    'playbooks',
    'help content',
    'articles',
  ],
  integrations: [
    'integrations',
    'integration',
    'live inventory',
    'calendar sync',
    'crm',
    'booking',
    'inventory',
    'commerce',
    'catalog',
    'catalogue',
    'whatsapp',
    'sms',
    'handover',
    'webhook',
    'slack',
  ],
};

/** Dashboard landing aliases, e.g. "take me to my dashboard". */
const DASHBOARD_ALIAS = /\b(dashboard|main\s+page|overview|home|main\s+dashboard)\b/i;

/**
 * True when the utterance names the dashboard landing route.
 *
 * Exposed separately from {@link resolveNavigationTarget} because that function
 * *always* returns the dashboard href (it is a total function with a dashboard
 * fallback), which makes it unusable as a "did the user actually ask for the
 * dashboard?" predicate. Callers that need to distinguish an explicit dashboard
 * request from the fallback must use this.
 *
 * The alias list is intentionally word-bounded, so conversational filler is
 * handled by construction rather than by stripping: "please take me back to the
 * dashboard" matches on the noun, and the surrounding politeness ("please",
 * "take me back to") never has to be removed first.
 */
export function isDashboardAlias(text: string): boolean {
  return DASHBOARD_ALIAS.test(text);
}

interface KeywordMatch {
  tab: ClientStudioTab;
  index: number;
  length: number;
  /** True when a negation cue ("not", "instead of", …) precedes the keyword. */
  negated: boolean;
}

/**
 * Negation cues checked in the 24 characters immediately before a keyword.
 * "not the branding" excludes branding; it does not select it.
 *
 * Up to two filler words may sit between the cue and the keyword
 * ("not the branding", "instead of my persona"), which is how negation
 * actually surfaces in speech.
 */
const NEGATION_CUE =
  /(?:\bnot|\bno|\bnever|\bskip|\bavoid|rather than|instead of|dont|don't)(?:\s+[\w']+){0,2}\s*$/;

/** Whether the keyword starting at `index` is negated in the surrounding text. */
function isNegatedMatch(lowercased: string, index: number): boolean {
  const before = lowercased.slice(Math.max(0, index - 24), index);
  return NEGATION_CUE.test(before);
}

/** Find the literal `index` of a keyword inside already-lowercased text. */
function indexOfKeyword(haystack: string, keyword: string): number {
  return haystack.indexOf(keyword);
}

/**
 * Resolve the Studio viewport an utterance is asking for.
 *
 * Collision rules (documented because they are the subtle part):
 *   1. PHRASE BEATS PREFIX — a multi-word keyword is matched before its
 *      constituent words, so "knowledge base" resolves to knowledge and
 *      "visual identity" resolves to branding as a single phrase.
 *   2. NEGATIONS ARE EXCLUSIONS, NOT PREFERENCES — the object of the
 *      navigation verb comes first ("go to the knowledge page, not the
 *      branding"). A keyword directly preceded by a negation cue is DROPPED
 *      whenever a non-negated keyword survives; only if every match is
 *      negated do we fall back to the first one. An earlier "later match wins"
 *      heuristic got this backwards and sent the user to the page they had
 *      just said they did NOT want.
 *   3. EARLIEST SURVIVING MATCH WINS — after exclusions, the first keyword is
 *      the verb's object ("take me to knowledge, then branding" → knowledge).
 *      Ties at the same index prefer the longer phrase.
 *
 * Known limitation: negation is only detected when the cue directly precedes
 * the keyword, so "don't take me to branding, take me to knowledge" cannot be
 * disambiguated. That phrasing is rare; a full negation parser is not
 * warranted for a voice route hint.
 *
 * @returns The resolved tab, or `null` when no Studio keyword is present.
 */
export function resolveClientStudioTab(text: string): ClientStudioTab | null {
  const lower = text.toLowerCase();
  const matches: KeywordMatch[] = [];

  for (const tab of CLIENT_STUDIO_TABS) {
    for (const keyword of TAB_KEYWORDS[tab]) {
      const index = indexOfKeyword(lower, keyword);
      if (index === -1) continue;
      // A bare word must not match inside a longer word ("brand" in
      // "branding", "art" in "articles"). Reject when the character before or
      // after the match continues a word.
      const before = index === 0 ? ' ' : lower.charAt(index - 1);
      const after = lower.charAt(index + keyword.length) || ' ';
      if (/[a-z0-9]/.test(before) || /[a-z0-9]/.test(after)) continue;
      matches.push({ tab, index, length: keyword.length, negated: isNegatedMatch(lower, index) });
    }
  }

  if (matches.length === 0) return null;

  // Drop negated targets whenever a wanted one survives; otherwise keep the
  // earliest match. Ties at the same index prefer the longer phrase.
  const wanted = matches.filter((match) => !match.negated);
  const pool = wanted.length > 0 ? wanted : matches;
  pool.sort((a, b) => (a.index === b.index ? b.length - a.length : a.index - b.index));
  return pool[0]?.tab ?? null;
}

/** A resolved navigation destination. */
export interface ClientNavigationTarget {
  /** The Studio tab, or `null` for the dashboard landing route. */
  tab: ClientStudioTab | null;
  /** A real, routable href. Never empty. */
  href: string;
}

/**
 * Resolve an utterance to a concrete navigation destination.
 *
 * The fallback is the dashboard landing route rather than any Studio tab:
 * landing the user on a real, always-valid screen is a far better failure
 * mode than guessing a viewport and potentially 404ing. The *callers* decide
 * whether a missing tab should navigate at all — this function only guarantees
 * that whatever it returns is routable.
 */
export function resolveNavigationTarget(text: string): ClientNavigationTarget {
  if (isDashboardAlias(text)) {
    return { tab: null, href: CLIENT_DASHBOARD_HREF };
  }
  const tab = resolveClientStudioTab(text);
  if (tab) {
    return { tab, href: clientStudioHref(tab) };
  }
  return { tab: null, href: CLIENT_DASHBOARD_HREF };
}
