/**
 * @file reseller-routes.ts
 *
 * Single source of truth for RESELLER-surface navigation targets, and the
 * security gate for AI-proposed destinations.
 *
 * Why this exists:
 *   `SYSTEM_RESELLER_NAVIGATE` lets the model turn a spoken sentence
 *   ("take me to branding") into a browser destination. That makes the model an
 *   untrusted producer of URLs: whatever it puts in `payload.href` would reach
 *   `router.push()` untouched if we trusted it, which turns a hallucinated or
 *   prompt-injected utterance into a same-origin navigation out of the reseller
 *   surface (`/admin`, `/client/**`) or, worse, an off-origin one. This module
 *   never trusts it. An AI-supplied href is admitted only if it matches exactly
 *   one shape: a same-origin path under `/reseller/<this reseller's slug>/`,
 *   free of scheme, authority, traversal, and any character a browser or the
 *   Next.js router could normalize into one of those.
 *
 * Why a tab allowlist at all:
 *   `payload.tab` is a token, not a path, so it is structurally incapable of
 *   carrying a destination the model invented — the worst it can do is name a
 *   view that does not exist, which this module answers with `null` (the caller
 *   then speaks a correction) instead of guessing.
 *
 * Scope boundary (AGENTS.md):
 *   `src/lib/voice/client-routes.ts` and `src/lib/zeeder/action-registry.ts`
 *   are CLIENT (Zeeder) surface modules. Nothing here imports them, references
 *   their constants, or reuses their keyword tables — the Reseller surface owns
 *   this vocabulary independently.
 *
 * Deliberately a PURE LEAF: no React, no `next/*`, no server-only imports. It
 * is consumed by a `'use client'` voice hook, so it must stay isomorphic and
 * runnable under the bare `node` test environment.
 */

/** Every Reseller-surface route lives under this prefix. */
export const RESELLER_ROUTE_PREFIX = '/reseller';

/**
 * The reseller views the model is allowed to name.
 *
 * Every token is verified against a real `page.tsx` under
 * `src/app/(dashboard)/reseller/[resellerSlug]/`:
 * `clients` · `branding` · `revenue` · `ai-engine` · `signal` · `knowledge` ·
 * `deployment`.
 *
 * Two deliberate omissions:
 *   - `settings` is ABSENT. The system prompt offers it as an example token,
 *     but no such route exists on the filesystem, so honouring it would trade a
 *     spoken "I couldn't find that section" for a hard 404.
 *   - `client` (singular) is ABSENT. `reseller/[slug]/client` exists only as a
 *     `router.replace` stub that forwards to `clients`; navigating it would
 *     burn a redirect on every request and teach the model that dead ends work.
 */
export const RESELLER_VIEW_TABS = [
  'dashboard',
  'clients',
  'branding',
  'revenue',
  'ai-engine',
  'signal',
  'knowledge',
  'deployment',
] as const;

/** One of {@link RESELLER_VIEW_TABS}. */
export type ResellerViewTab = (typeof RESELLER_VIEW_TABS)[number];

const RESELLER_VIEW_TAB_SET: ReadonlySet<string> = new Set(RESELLER_VIEW_TABS);

/**
 * Path segment for each token, relative to `/reseller/<slug>/`.
 *
 * `dashboard` resolves to `clients` rather than to the bare index route. The
 * index route (`reseller/[slug]/page.tsx`) exists but renders an empty
 * `<main>` with no navigation of its own, while every real entry point — the
 * post-auth redirect and the nav's home button — lands on the clients grid. So
 * "take me to the dashboard" means the clients grid, and going there is the
 * only interpretation that leaves the user on a usable screen.
 */
const RESELLER_VIEW_PATHS: Readonly<Record<ResellerViewTab, string>> = {
  dashboard: 'clients',
  clients: 'clients',
  branding: 'branding',
  revenue: 'revenue',
  'ai-engine': 'ai-engine',
  signal: 'signal',
  knowledge: 'knowledge',
  deployment: 'deployment',
};

/**
 * Characters a reseller slug segment may contain.
 *
 * Deliberately an allowlist rather than a denylist: the slug becomes one URL
 * path segment, so anything with meaning in a URL (`/`, `\`, `?`, `#`, `%`,
 * `:`, whitespace, control characters) is refused outright rather than escaped
 * and hoped for. The set matches the charset the app itself accepts — the
 * reseller index page validates its own param as `^[a-zA-Z0-9-_]+$`, and
 * `resellers.tenant_id` fallbacks are UUIDs (hyphens only).
 */
const SAFE_SLUG_SEGMENT = /[^A-Za-z0-9._~-]/;

/**
 * Type guard for an untrusted `tab`/`view` value read off a JSON payload.
 * Exact-match only — normalization for human-shaped model output lives in
 * {@link coerceResellerViewTab}, which is internal to the resolver.
 */
export function isResellerViewTab(value: unknown): value is ResellerViewTab {
  return typeof value === 'string' && RESELLER_VIEW_TAB_SET.has(value);
}

/**
 * Reduce a trusted-or-uncertain slug to a single, safe URL path segment.
 *
 * Exactly ONE leading and ONE trailing slash are tolerated (`/acme/`, `acme/`),
 * because slug values reach us from route params and props that are sometimes
 * pre-wrapped. Anything that still contains a separator afterwards is REJECTED
 * rather than collapsed: flattening `//evil.com` into `evil.com` would invent a
 * tenant the caller never asked about, and flattening `a/b` would silently
 * truncate a value that is plainly not a slug.
 *
 * A bare `.` is rejected for the same reason `..` is: the WHATWG URL parser
 * deletes a `.` segment, so `/reseller/./branding` would resolve to
 * `/reseller/branding` and escape the slug scope entirely.
 *
 * @returns the normalized slug, or `null` when the input cannot be trusted.
 */
export function normalizeResellerSlug(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().replace(/^\//, '').replace(/\/$/, '');
  if (!trimmed) return null;
  if (trimmed === '.' || trimmed.includes('..')) return null;
  if (SAFE_SLUG_SEGMENT.test(trimmed)) return null;
  return trimmed;
}

/**
 * Build the route for a reseller view, e.g.
 * `resellerHref('acme', 'branding')` → `/reseller/acme/branding`.
 *
 * @throws if `slug` is not a usable single path segment. This is a TYPED
 * builder (both parameters are already narrowed), so a bad slug is a caller
 * bug and must be loud rather than silently producing `/reseller//branding`.
 * Untrusted input never reaches this function directly — it goes through
 * {@link resolveResellerNavigationTarget}, which returns `null` instead.
 */
export function resellerHref(slug: string, tab: ResellerViewTab): string {
  const normalizedSlug = normalizeResellerSlug(slug);
  if (!normalizedSlug) {
    throw new Error(`resellerHref received an unusable reseller slug: ${JSON.stringify(slug)}`);
  }
  return `${RESELLER_ROUTE_PREFIX}/${normalizedSlug}/${RESELLER_VIEW_PATHS[tab]}`;
}

/** A destination that has already passed the gate and is safe to navigate to. */
export type ResellerNavigationTarget = {
  /** An absolute, same-origin path under `/reseller/<slug>/`. */
  href: string;
  /**
   * The view this destination corresponds to, or `null` when the href named a
   * path this module does not model as a view (e.g. a nested client route) or
   * when the caller's slug was unknown.
   */
  tab: ResellerViewTab | null;
};

/**
 * The complete character set an admitted href may contain: ASCII letters,
 * digits, and `/ . _ ~ -`. This is a POSITIVE allowlist, which is what makes
 * the gate safe by construction — every rejected class below is excluded
 * because it contains a character that is not on the list, rather than because
 * someone remembered to blacklist it:
 *   - `%` → kills percent-encoding, so no `%2e%2e%2f` / `%2F` / `%00` tricks
 *   - `?` and `#` → no query or fragment smuggling (`?next=` open redirects)
 *   - `:` → no `javascript:`, `data:`, or any other scheme
 *   - whitespace and control characters → no `\`- or CR/LF-based normalization
 * `~` and `.` are harmless inside a segment; `..` is rejected separately below.
 */
const SAFE_RESELLER_HREF = /^\/reseller\/[A-Za-z0-9._~\-/]*$/;

/**
 * The security gate for an AI-supplied href.
 *
 * Each check is stated explicitly even where the allowlist already implies it:
 * this function is the trust boundary between a language model and the browser
 * history, so a future edit that loosens the regex must not be able to
 * accidentally re-open any of these by deleting a "redundant" line.
 */
function isGatedResellerHref(value: string, normalizedSlug: string | null): boolean {
  if (value.length === 0) return false;
  // Protocol-relative `//evil.com` — the browser reads the second slash as the
  // start of an authority and leaves the origin entirely.
  if (value.startsWith('//')) return false;
  // Anything not beginning with a single `/` is either absolute (`https://…`)
  // or scheme-relative (`javascript:`, `data:text/html,…`).
  if (!value.startsWith('/')) return false;
  // Some browsers normalize `\` to `/`, which would turn a rejected string into
  // a path that passes the checks below.
  if (value.includes('\\')) return false;
  // Traversal, in the two forms the URL parser acts on: literal `..`, and a
  // bare `.` segment (already excluded from the charset only for `%2e`).
  if (value.includes('..')) return false;
  if (!SAFE_RESELLER_HREF.test(value)) return false;
  // Hard scope gate: this is the Reseller surface, never the client surface,
  // never `/admin`, and never a bare `/reseller` or `/reseller/` root.
  if (!value.startsWith(`${RESELLER_ROUTE_PREFIX}/`)) return false;
  // Tenant gate: with a known slug, the href must belong to THIS reseller, so a
  // model cannot walk the user into a sibling tenant's dashboard.
  if (normalizedSlug && !value.startsWith(`${RESELLER_ROUTE_PREFIX}/${normalizedSlug}/`)) return false;
  return true;
}

/** Recover the view token from a gated href, or `null` if it names no known view. */
function tabFromHref(href: string, normalizedSlug: string): ResellerViewTab | null {
  const prefix = `${RESELLER_ROUTE_PREFIX}/${normalizedSlug}/`;
  if (!href.startsWith(prefix)) return null;
  const segment = href.slice(prefix.length).split('/')[0] ?? '';
  return isResellerViewTab(segment) ? segment : null;
}

/**
 * Coerce a model-authored token to a known view.
 *
 * Models routinely emit `"Branding"`, `"AI Engine"`, or `"ai_engine"` for the
 * same view. Case-folding and separator-folding cannot widen the allowlist —
 * the return value is always a member of {@link RESELLER_VIEW_TABS} or `null` —
 * so the normalization is safe, and it removes an entire class of "Hannah said
 * she understood but silently did nothing" failures.
 */
function coerceResellerViewTab(value: unknown): ResellerViewTab | null {
  if (typeof value !== 'string') return null;
  const token = value.trim().toLowerCase().replace(/[\s_]+/g, '-');
  return isResellerViewTab(token) ? token : null;
}

/**
 * Resolve an AI navigation payload to a SAFE destination, or `null`.
 *
 * `null` is a meaningful answer, not a failure to be papered over: it means
 * "do not navigate". The caller is expected to speak a short correction and stay
 * put. There is deliberately NO dashboard fallback — guessing a destination the
 * user did not ask for is worse than admitting the request was not understood,
 * and it would also mask the fact that the model invented a view.
 *
 * Resolution order:
 *   1. `href` — honoured ONLY if it clears {@link isGatedResellerHref}. A href
 *      that fails the gate is discarded, not repaired, and resolution continues
 *      with `tab`/`view` (which is how "go to /admin" degrades into a spoken
 *      correction rather than into a client-surface navigation).
 *   2. `tab` then `view` — `view` is a true alias: the prompt emits both, and
 *      callers may populate either.
 *
 * @param payload AI-supplied fields. Typed `unknown` because the value arrives
 *   from a model and must be narrowed, never asserted.
 * @param resellerSlug the slug of the reseller the user is currently acting as.
 */
export function resolveResellerNavigationTarget(
  payload: { tab?: unknown; href?: unknown; view?: unknown },
  resellerSlug: string | undefined,
): ResellerNavigationTarget | null {
  const normalizedSlug = normalizeResellerSlug(resellerSlug);
  const record: Record<string, unknown> =
    payload && typeof payload === 'object' && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : {};

  const rawHref = record.href;
  if (typeof rawHref === 'string') {
    const candidate = rawHref.trim();
    if (isGatedResellerHref(candidate, normalizedSlug)) {
      return {
        href: candidate,
        tab: normalizedSlug ? tabFromHref(candidate, normalizedSlug) : null,
      };
    }
  }

  const token = coerceResellerViewTab(record.tab) ?? coerceResellerViewTab(record.view);
  if (!token) return null;
  // Without a trustworthy slug there is no way to build a same-tenant href, and
  // emitting a bare `/reseller/...` would let a model address any tenant.
  if (!normalizedSlug) return null;
  return { href: resellerHref(normalizedSlug, token), tab: token };
}

/** TTS-ready phrasing for each view, e.g. "the branding studio". */
const RESELLER_TARGET_PHRASES: Readonly<Record<ResellerViewTab, string>> = {
  dashboard: 'your dashboard',
  clients: 'the clients grid',
  branding: 'the branding studio',
  revenue: 'the revenue dashboard',
  'ai-engine': 'the AI engine',
  signal: 'the signal console',
  knowledge: 'the knowledge manager',
  deployment: 'the deployment studio',
};

/**
 * Human-readable name for a destination, for TTS summaries.
 *
 * Callers compose it into a sentence ("Taking you to the branding studio."), so
 * the return value carries no trailing punctuation.
 */
export function describeResellerTarget(tab: ResellerViewTab | null | undefined): string {
  if (!tab) return 'that section';
  return RESELLER_TARGET_PHRASES[tab] ?? 'that section';
}
