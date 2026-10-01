// src/lib/voice/__tests__/client-routes.test.ts
//
// Node-only vitest: the client route resolver is a pure leaf module (no
// AudioContext, no DOM, no React), so it needs neither jsdom nor Web Audio.

import { describe, it, expect } from 'vitest';
import {
  CLIENT_DASHBOARD_HREF,
  CLIENT_STUDIO_BASE,
  CLIENT_STUDIO_TABS,
  clientStudioHref,
  isClientStudioTab,
  hasNavigationIntent,
  resolveClientStudioTab,
  resolveNavigationTarget,
  isDashboardAlias,
  type ClientStudioTab,
} from '../client-routes';

describe('clientStudioHref', () => {
  it('builds a distinct, real route for every Studio tab', () => {
    const hrefs = CLIENT_STUDIO_TABS.map(clientStudioHref);
    expect(hrefs).toEqual([
      '/client/dashboard/studio/branding',
      '/client/dashboard/studio/persona',
      '/client/dashboard/studio/knowledge',
      '/client/dashboard/studio/integrations',
    ]);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it('never emits a path outside the client surface', () => {
    for (const tab of CLIENT_STUDIO_TABS) {
      expect(clientStudioHref(tab).startsWith(`${CLIENT_STUDIO_BASE}/`)).toBe(true);
    }
    expect(CLIENT_DASHBOARD_HREF.startsWith('/client/')).toBe(true);
  });
});

describe('isClientStudioTab', () => {
  it('accepts the four real tabs and rejects everything else', () => {
    for (const tab of CLIENT_STUDIO_TABS) {
      expect(isClientStudioTab(tab)).toBe(true);
    }
    for (const bogus of ['analytics', 'memories', 'Branding', '', null, undefined, 7, {}]) {
      expect(isClientStudioTab(bogus)).toBe(false);
    }
  });
});

describe('hasNavigationIntent', () => {
  it('detects explicit navigation phrasings', () => {
    for (const text of [
      'take me to the knowledge page',
      'go to the integrations tab',
      'open my persona settings',
      'navigate to the dashboard',
      'show me the branding',
      'where is the knowledge base',
      'head over to the crm',
    ]) {
      expect(hasNavigationIntent(text), text).toBe(true);
    }
  });

  it('does not steal mutation or booking commands', () => {
    for (const text of [
      'update my branding',
      'change the header color',
      'set my logo',
      'book a massage',
      'make me a sandwich',
    ]) {
      expect(hasNavigationIntent(text), text).toBe(false);
    }
  });
});

describe('resolveClientStudioTab', () => {
  it('maps knowledge vocabulary to the Knowledge viewport', () => {
    for (const text of [
      'take me to the knowledge page',
      'open my faq',
      'show the training documents',
      'where do i find the policies',
      'open the knowledge base',
    ]) {
      expect(resolveClientStudioTab(text), text).toBe('knowledge');
    }
  });

  it('maps branding vocabulary to the Branding viewport', () => {
    for (const text of [
      'open the branding page',
      'show me my logo',
      'go to my colours',
      'open the visual identity',
    ]) {
      expect(resolveClientStudioTab(text), text).toBe('branding');
    }
  });

  it('maps persona vocabulary to the Persona viewport', () => {
    for (const text of [
      'open the persona page',
      'adjust the ai voice',
      'show me the tone settings',
    ]) {
      expect(resolveClientStudioTab(text), text).toBe('persona');
    }
  });

  it('maps integration vocabulary to the Integrations viewport', () => {
    for (const text of [
      'open the integrations tab',
      'where is my crm',
      'show the live inventory setup',
      'open my calendar sync',
    ]) {
      expect(resolveClientStudioTab(text), text).toBe('integrations');
    }
  });

  it('reserves branding for branding words (no cross-contamination)', () => {
    // "knowledge" must never leak into branding and vice-versa.
    expect(resolveClientStudioTab('take me to the knowledge page')).toBe('knowledge');
    expect(resolveClientStudioTab('take me to the branding page')).toBe('branding');
  });

  it('returns null when no Studio vocabulary is present', () => {
    for (const text of ['make me a sandwich', 'show me the analytics', 'how is the weather']) {
      expect(resolveClientStudioTab(text), text).toBeNull();
    }
  });

  it('prefers the longest phrase at the same position', () => {
    expect(resolveClientStudioTab('open the knowledge base')).toBe('knowledge');
    expect(resolveClientStudioTab('open the live inventory page')).toBe('integrations');
  });

  it('treats a negated target as an exclusion, not a preference', () => {
    expect(resolveClientStudioTab('go to the knowledge page, not the branding')).toBe('knowledge');
    expect(resolveClientStudioTab('not the persona, take me to knowledge')).toBe('knowledge');
    expect(resolveClientStudioTab('open the integrations tab instead of branding')).toBe(
      'integrations',
    );
  });

  it('prefers the earliest surviving target when nothing is negated', () => {
    expect(resolveClientStudioTab('take me to knowledge, then branding')).toBe('knowledge');
  });
});

describe('resolveNavigationTarget', () => {
  it('resolves a Studio utterance to its tab and href', () => {
    expect(resolveNavigationTarget('take me to the knowledge page')).toEqual({
      tab: 'knowledge',
      href: '/client/dashboard/studio/knowledge',
    });
  });

  it('resolves dashboard aliases to the landing route', () => {
    for (const text of ['go to my dashboard', 'take me to the overview', 'show my home page']) {
      expect(resolveNavigationTarget(text), text).toEqual({
        tab: null,
        href: CLIENT_DASHBOARD_HREF,
      });
    }
  });

  it('falls back to the dashboard (never an empty or 404 path)', () => {
    const target = resolveNavigationTarget('make me a sandwich');
    expect(target.tab).toBeNull();
    expect(target.href).toBe(CLIENT_DASHBOARD_HREF);
    expect(target.href).not.toBe('');
  });

  it('covers every declared tab', () => {
    for (const tab of CLIENT_STUDIO_TABS as readonly ClientStudioTab[]) {
      const target = resolveNavigationTarget(`open the ${tab} page`);
      expect(target.tab, tab).toBe(tab);
      expect(target.href, tab).toBe(clientStudioHref(tab));
    }
  });

  // Regression: dashboard phrases used to bypass this module entirely. The
  // route gated on `resolveClientStudioTab(...) !== null`, so a dashboard
  // request (a REAL route, but with no Studio tab) fell through to the LLM,
  // which replied SYSTEM_NAVIGATE with an empty payload. `useZeederVoice` then
  // logged `had no usable target (tab="undefined", href="undefined")`.
  it('resolves conversational dashboard phrasings with filler and politeness', () => {
    for (const text of [
      'Please take me back to the dashboard',
      'take me to dashboard',
      'take me back to the dashboard',
      'please take me back to the dashboard',
      'can you take me back to the dashboard please',
      'go to my dashboard',
      'show my home page',
      'take me to the overview',
      'open the main dashboard',
    ]) {
      const target = resolveNavigationTarget(text);
      expect(target.tab, text).toBeNull();
      expect(target.href, text).toBe(CLIENT_DASHBOARD_HREF);
      // The consumer's contract: href must be non-empty and inside /client/.
      expect(target.href.startsWith('/client/'), text).toBe(true);
    }
  });
});

describe('isDashboardAlias', () => {
  it('is true for every dashboard noun', () => {
    for (const text of [
      'take me to the dashboard',
      'go to dashboard',
      'show my home page',
      'take me to the overview',
      'open the main page',
      'open the main dashboard',
    ]) {
      expect(isDashboardAlias(text), text).toBe(true);
    }
  });

  it('is false for Studio utterances and for unrelated speech', () => {
    // Guards the `hasStudioTab || isDashboardAlias(...)` short-circuit in the
    // route: if this ever returned true for "show me the analytics", the user
    // would be silently dumped on the dashboard.
    for (const text of [
      'open the branding page',
      'where do I find my CRM',
      'show me the analytics',
      'make me a sandwich',
      'how is the weather',
    ]) {
      expect(isDashboardAlias(text), text).toBe(false);
    }
  });
});
