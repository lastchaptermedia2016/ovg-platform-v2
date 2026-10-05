// src/lib/voice/__tests__/reseller-routes.test.ts
//
// Node-only vitest: reseller-routes is a pure leaf module (no DOM, no React,
// no next/*), so it needs neither jsdom nor Web Audio. The filesystem check at
// the bottom is the point of the module: a token whose page.tsx does not exist
// would turn a spoken command into a 404.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  RESELLER_ROUTE_PREFIX,
  RESELLER_VIEW_TABS,
  describeResellerTarget,
  isResellerViewTab,
  normalizeResellerSlug,
  resellerHref,
  resolveResellerNavigationTarget,
  type ResellerViewTab,
} from '../reseller-routes';

const SLUG = 'acme';

describe('resellerHref', () => {
  it('builds a real, distinct route for every known view', () => {
    expect(resellerHref(SLUG, 'branding')).toBe('/reseller/acme/branding');
    expect(resellerHref(SLUG, 'revenue')).toBe('/reseller/acme/revenue');
    expect(resellerHref(SLUG, 'ai-engine')).toBe('/reseller/acme/ai-engine');
    expect(resellerHref(SLUG, 'signal')).toBe('/reseller/acme/signal');
    expect(resellerHref(SLUG, 'knowledge')).toBe('/reseller/acme/knowledge');
    expect(resellerHref(SLUG, 'deployment')).toBe('/reseller/acme/deployment');
    expect(resellerHref(SLUG, 'clients')).toBe('/reseller/acme/clients');

    const hrefs = RESELLER_VIEW_TABS.map((tab) => resellerHref(SLUG, tab));
    expect(hrefs.every((href) => href.startsWith(`${RESELLER_ROUTE_PREFIX}/${SLUG}/`))).toBe(true);
  });

  it('keeps every emitted path inside the reseller surface', () => {
    for (const tab of RESELLER_VIEW_TABS) {
      expect(resellerHref(SLUG, tab).startsWith('/reseller/acme/')).toBe(true);
    }
  });

  it('maps the dashboard token to the clients grid, the app-wide landing route', () => {
    // `reseller/[slug]/page.tsx` renders an empty <main>; every real entry
    // point (post-auth redirect, nav home) lands on the clients grid.
    expect(resellerHref(SLUG, 'dashboard')).toBe('/reseller/acme/clients');
  });

  it('tolerates one leading and one trailing slash on the slug', () => {
    expect(resellerHref('/acme/', 'branding')).toBe('/reseller/acme/branding');
    expect(resellerHref('acme/', 'branding')).toBe('/reseller/acme/branding');
    expect(resellerHref('/acme', 'branding')).toBe('/reseller/acme/branding');
    expect(resellerHref('  acme  ', 'branding')).toBe('/reseller/acme/branding');
  });

  it('rejects an unusable slug loudly instead of emitting a broken path', () => {
    for (const bad of ['', '   ', '/', '//', '//evil.com', '..', '.', 'a/../b', 'a b', 'a\\b', 'a?b']) {
      expect(() => resellerHref(bad, 'clients')).toThrow();
    }
  });
});

describe('normalizeResellerSlug', () => {
  it('normalizes wrapped slugs and refuses everything else', () => {
    expect(normalizeResellerSlug('acme')).toBe('acme');
    expect(normalizeResellerSlug('/acme/')).toBe('acme');
    expect(normalizeResellerSlug('')).toBeNull();
    expect(normalizeResellerSlug('/')).toBeNull();
    expect(normalizeResellerSlug('//evil.com')).toBeNull();
    expect(normalizeResellerSlug('..')).toBeNull();
    expect(normalizeResellerSlug('.')).toBeNull();
    expect(normalizeResellerSlug('a/b')).toBeNull();
    expect(normalizeResellerSlug('a\\b')).toBeNull();
    expect(normalizeResellerSlug(undefined)).toBeNull();
    expect(normalizeResellerSlug(null)).toBeNull();
    expect(normalizeResellerSlug(42)).toBeNull();
  });

  it('accepts the slug shapes the app itself accepts (uuid tenant_id fallbacks)', () => {
    expect(normalizeResellerSlug('2f1a9b3c-4d5e-6f70-8192-a3b4c5d6e7f8')).toBe(
      '2f1a9b3c-4d5e-6f70-8192-a3b4c5d6e7f8',
    );
    expect(normalizeResellerSlug('lastchaptermedia2016')).toBe('lastchaptermedia2016');
  });
});

describe('isResellerViewTab', () => {
  it('accepts the real views and rejects everything else', () => {
    for (const tab of RESELLER_VIEW_TABS) {
      expect(isResellerViewTab(tab)).toBe(true);
    }
    for (const bogus of ['settings', 'analytics', 'memories', 'Branding', '', null, undefined, 7, {}, []]) {
      expect(isResellerViewTab(bogus)).toBe(false);
    }
  });
});

describe('resolveResellerNavigationTarget — tab tokens', () => {
  it('resolves a known token to a slug-scoped href', () => {
    expect(resolveResellerNavigationTarget({ tab: 'branding' }, SLUG)).toEqual({
      href: '/reseller/acme/branding',
      tab: 'branding',
    });
  });

  it('treats `view` as an alias of `tab`', () => {
    expect(resolveResellerNavigationTarget({ view: 'revenue' }, SLUG)).toEqual({
      href: '/reseller/acme/revenue',
      tab: 'revenue',
    });
    // `tab` wins when both are present and both are known.
    expect(resolveResellerNavigationTarget({ tab: 'branding', view: 'revenue' }, SLUG)).toEqual({
      href: '/reseller/acme/branding',
      tab: 'branding',
    });
  });

  it('folds model-authored casing and separators onto a known token', () => {
    expect(resolveResellerNavigationTarget({ tab: 'Branding' }, SLUG)).toEqual({
      href: '/reseller/acme/branding',
      tab: 'branding',
    });
    expect(resolveResellerNavigationTarget({ tab: 'AI Engine' }, SLUG)).toEqual({
      href: '/reseller/acme/ai-engine',
      tab: 'ai-engine',
    });
    expect(resolveResellerNavigationTarget({ tab: 'ai_engine' }, SLUG)).toEqual({
      href: '/reseller/acme/ai-engine',
      tab: 'ai-engine',
    });
  });

  it('returns null — do not navigate — for an unknown token', () => {
    // `settings` is the token the system prompt suggests, but no such route
    // exists, so it must never produce a destination.
    expect(resolveResellerNavigationTarget({ tab: 'settings' }, SLUG)).toBeNull();
    expect(resolveResellerNavigationTarget({ view: 'settings' }, SLUG)).toBeNull();
    expect(resolveResellerNavigationTarget({ tab: 'analytics' }, SLUG)).toBeNull();
    expect(resolveResellerNavigationTarget({ tab: 'memories' }, SLUG)).toBeNull();
    expect(resolveResellerNavigationTarget({ tab: '../../admin' }, SLUG)).toBeNull();
    expect(resolveResellerNavigationTarget({ tab: '' }, SLUG)).toBeNull();
    expect(resolveResellerNavigationTarget({ tab: '/reseller/acme/admin' }, SLUG)).toBeNull();
  });

  it('returns null when the slug is missing or unusable, since no href can be built', () => {
    expect(resolveResellerNavigationTarget({ tab: 'branding' }, undefined)).toBeNull();
    expect(resolveResellerNavigationTarget({ tab: 'branding' }, '')).toBeNull();
    expect(resolveResellerNavigationTarget({ tab: 'branding' }, '   ')).toBeNull();
    expect(resolveResellerNavigationTarget({ tab: 'branding' }, '/')).toBeNull();
  });

  it('returns null for non-string and absent tokens', () => {
    for (const bad of [7, true, {}, [], null, undefined, () => 'branding']) {
      expect(resolveResellerNavigationTarget({ tab: bad }, SLUG)).toBeNull();
      expect(resolveResellerNavigationTarget({ view: bad }, SLUG)).toBeNull();
    }
    expect(resolveResellerNavigationTarget({}, SLUG)).toBeNull();
  });
});

describe('resolveResellerNavigationTarget — href gate', () => {
  it('accepts a /reseller/... href when the slug matches', () => {
    expect(resolveResellerNavigationTarget({ href: '/reseller/acme/branding' }, SLUG)).toEqual({
      href: '/reseller/acme/branding',
      tab: 'branding',
    });
    // A nested route under this reseller is still in-scope; the tab is simply
    // the first known view segment, or null when there is none.
    expect(resolveResellerNavigationTarget({ href: '/reseller/acme/clients/new' }, SLUG)).toEqual({
      href: '/reseller/acme/clients/new',
      tab: 'clients',
    });
    expect(resolveResellerNavigationTarget({ href: '/reseller/acme/anything-else' }, SLUG)).toEqual({
      href: '/reseller/acme/anything-else',
      tab: null,
    });
  });

  it('rejects a /reseller/... href belonging to a different tenant', () => {
    expect(resolveResellerNavigationTarget({ href: '/reseller/other/branding' }, SLUG)).toBeNull();
    expect(resolveResellerNavigationTarget({ href: '/reseller/acme-evil/branding' }, SLUG)).toBeNull();
    // Sibling-tenant walk disguised as this tenant's own slug prefix.
    expect(resolveResellerNavigationTarget({ href: '/reseller/acme2/branding' }, SLUG)).toBeNull();
    // The bare tenant root is not "under" the tenant root, so it fails the
    // `/reseller/<slug>/` prefix; the trailing-slash form does pass and is the
    // real (empty-shell) index route, reported with no view attached.
    expect(resolveResellerNavigationTarget({ href: '/reseller/acme' }, SLUG)).toBeNull();
    expect(resolveResellerNavigationTarget({ href: '/reseller/acme/' }, SLUG)).toEqual({
      href: '/reseller/acme/',
      tab: null,
    });
  });

  it('rejects off-origin, out-of-surface, and malformed hrefs', () => {
    const rejected = [
      'https://evil.com/x',
      'http://evil.com',
      '//evil.com/x',
      '//evil.com',
      'javascript:alert(1)',
      'JavaScript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'data:text/html,',
      '/admin',
      '/admin/users',
      '/client/dashboard',
      '/client/dashboard/studio/branding',
      '/widget',
      '/',
      '/reseller',
      '/reseller/',
      '/resellers/acme',
      '/Reseller/acme/branding',
      '\\reseller\\acme',
      '/reseller\\acme\\branding',
      '/reseller/acme/../../admin',
      '/reseller/acme/../other/branding',
      '/reseller/acme/..',
      '/reseller/acme/branding/./..',
      '/reseller/acme/branding?next=https://evil.com',
      '/reseller/acme/branding#x',
      '/reseller/acme/branding%2f..%2f..%2fadmin',
      '/reseller/ac me/branding',
      'reseller/acme/branding',
      '',
      '   ',
    ];
    for (const href of rejected) {
      expect(resolveResellerNavigationTarget({ href }, SLUG)).toBeNull();
    }
  });

  it('rejects non-string hrefs outright', () => {
    for (const bad of [7, true, {}, [], ['/reseller/acme/branding'], null, undefined]) {
      expect(resolveResellerNavigationTarget({ href: bad }, SLUG)).toBeNull();
    }
  });

  it('falls through to a valid token when the href is rejected', () => {
    expect(resolveResellerNavigationTarget({ href: '/admin', tab: 'branding' }, SLUG)).toEqual({
      href: '/reseller/acme/branding',
      tab: 'branding',
    });
    expect(resolveResellerNavigationTarget({ href: '', view: 'revenue' }, SLUG)).toEqual({
      href: '/reseller/acme/revenue',
      tab: 'revenue',
    });
    // A rejected href with nothing usable behind it stays a refusal.
    expect(resolveResellerNavigationTarget({ href: '/admin', tab: 'settings' }, SLUG)).toBeNull();
  });

  it('keeps a same-tenant href even when no slug is known, but reports no tab', () => {
    // Without a tenant to compare against the prefix is enforced alone; the
    // caller (which always has the slug) is the stronger boundary.
    expect(resolveResellerNavigationTarget({ href: '/reseller/acme/branding' }, undefined)).toEqual({
      href: '/reseller/acme/branding',
      tab: null,
    });
    // Out-of-surface hrefs are still refused with no slug.
    expect(resolveResellerNavigationTarget({ href: '/admin' }, undefined)).toBeNull();
  });

  it('trims surrounding whitespace before gating, and navigates to the trimmed value', () => {
    expect(resolveResellerNavigationTarget({ href: '  /reseller/acme/branding  ' }, SLUG)).toEqual({
      href: '/reseller/acme/branding',
      tab: 'branding',
    });
  });
});

describe('resolveResellerNavigationTarget — hostile payloads', () => {
  it('returns null for garbage payloads instead of throwing', () => {
    const garbage: Array<Record<string, unknown>> = [
      {},
      { tab: {}, href: {} },
      { tab: { nested: 'branding' }, view: { nested: 'branding' } },
      { tab: ['branding'], href: ['/reseller/acme/branding'] },
      { tab: null, href: null, view: null },
      { tab: undefined, href: undefined, view: undefined },
      { tab: 'toString', view: 'constructor', href: '__proto__' },
      { href: '/reseller/acme/branding', tab: 'settings' },
      { unexpected: 'shape' },
    ];
    for (const payload of garbage) {
      expect(resolveResellerNavigationTarget(payload, SLUG)).not.toBeUndefined();
    }
    expect(resolveResellerNavigationTarget({ tab: { nested: 'branding' } }, SLUG)).toBeNull();
    expect(resolveResellerNavigationTarget({ tab: ['branding'] }, SLUG)).toBeNull();
    expect(resolveResellerNavigationTarget({ tab: 'toString' }, SLUG)).toBeNull();
    expect(resolveResellerNavigationTarget({}, SLUG)).toBeNull();
    // An in-scope href still wins over an unusable token beside it.
    expect(resolveResellerNavigationTarget({ href: '/reseller/acme/branding', tab: 'settings' }, SLUG)).toEqual({
      href: '/reseller/acme/branding',
      tab: 'branding',
    });
  });
});

describe('describeResellerTarget', () => {
  it('produces TTS-ready phrasing for every view', () => {
    expect(describeResellerTarget('branding')).toBe('the branding studio');
    expect(describeResellerTarget('clients')).toBe('the clients grid');
    expect(describeResellerTarget('revenue')).toBe('the revenue dashboard');
    expect(describeResellerTarget('ai-engine')).toBe('the AI engine');
    expect(describeResellerTarget('signal')).toBe('the signal console');
    expect(describeResellerTarget('knowledge')).toBe('the knowledge manager');
    expect(describeResellerTarget('deployment')).toBe('the deployment studio');
    expect(describeResellerTarget('dashboard')).toBe('your dashboard');
  });

  it('degrades to a neutral phrase when no view was identified', () => {
    expect(describeResellerTarget(null)).toBe('that section');
    expect(describeResellerTarget(undefined)).toBe('that section');
  });
});

describe('route parity with the filesystem', () => {
  it('every view token resolves to a page that actually exists', () => {
    for (const tab of RESELLER_VIEW_TABS) {
      const segment = resellerHref('parity-probe', tab).split('/').pop() as string;
      const page = path.join(
        process.cwd(),
        'src/app/(dashboard)/reseller/[resellerSlug]',
        segment,
        'page.tsx',
      );
      expect(fs.existsSync(page), `missing route page for "${tab}": ${page}`).toBe(true);
    }
  });

  it('declares no token without a corresponding ResellerViewTab entry', () => {
    for (const tab of RESELLER_VIEW_TABS) {
      const type: ResellerViewTab = tab;
      expect(type).toBe(tab);
    }
  });
});
