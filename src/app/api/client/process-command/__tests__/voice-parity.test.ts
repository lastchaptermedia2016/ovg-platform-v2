// src/app/api/client/process-command/__tests__/voice-parity.test.ts
//
// Voice-to-UI Functional Parity suite.
//
// Drives every case in `src/constants/voice-parity-map.ts` through the REAL
// `/api/client/process-command` route handler and asserts the router resolves
// each utterance to the SAME action/destination a human would reach by clicking
// (parity). A separate coverage test reads the real dashboard page tree off disk
// and asserts every navigable route has a voice route — no orphaned feature.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { POST } from '../route';
// Side-effect import: ensures the mocked module is part of the test module
// graph (the mock factory above replaces it for the route under test).
import '@/lib/supabase/admin';
import { getAuthenticatedUser, createAuthClient } from '@/lib/auth/server';
import { resolveTenantId } from '@/lib/resolveTenantId';
import { getTenantKnowledgeContext } from '@/lib/reseller/tenant-knowledge-engine';
import {
  getClientMemories,
  extractAndStoreMemories,
  getVisitorMemories,
  extractAndStoreVisitorMemories,
  touchVisitorMemory,
} from '@/lib/ai/memory-service';
import {
  VOICE_PARITY_CASES,
  NAVIGATION_PARITY_CASES,
  DASHBOARD_ROUTES,
  type VoiceParityCase,
} from '@/constants/voice-parity-map';

process.env.GROQ_API_KEY = process.env.GROQ_API_KEY || 'test-groq-key';

// ── Groq SDK mock (never actually called for deterministic cases) ─────────
vi.mock('groq-sdk', () => {
  class Groq {
    chat = {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [{ message: { content: JSON.stringify({ actionType: 'CLIENT_NOP', summary: 'ok' }) } }],
        }),
      },
    };
  }
  return { default: Groq };
});

// ── Auth + Supabase + knowledge + memory mocks ───────────────────────────
vi.mock('@/lib/auth/server', () => ({
  getAuthenticatedUser: vi.fn(),
  createAuthClient: vi.fn(),
}));

vi.mock('@/lib/resolveTenantId', () => ({
  resolveTenantId: vi.fn(),
}));

vi.mock('@/lib/audit/platform-logger', () => ({
  logPlatformAction: vi.fn(),
  persistChatMessage: vi.fn(),
}));

vi.mock('@/lib/reseller/tenant-knowledge-engine', () => ({
  getTenantKnowledgeContext: vi.fn().mockResolvedValue({ contextString: '', items: [], error: null }),
}));

vi.mock('@/lib/ai/memory-service', async () => {
  const actual = await vi.importActual<typeof import('@/lib/ai/memory-service')>('@/lib/ai/memory-service');
  return {
    ...actual,
    getClientMemories: vi.fn().mockResolvedValue({}),
    extractAndStoreMemories: vi.fn().mockResolvedValue(undefined),
    getVisitorMemories: vi.fn().mockResolvedValue({}),
    extractAndStoreVisitorMemories: vi.fn().mockResolvedValue(undefined),
    touchVisitorMemory: vi.fn().mockResolvedValue(undefined),
  };
});

function makeChain(): Record<string, unknown> {
  const chain: Record<string, unknown> = {};
  for (const m of ['from', 'select', 'eq', 'or', 'in', 'order', 'limit', 'insert', 'update']) {
    chain[m] = vi.fn().mockImplementation(() => chain);
  }
  chain.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
  chain.single = vi.fn().mockResolvedValue({ data: null, error: null });
  chain.then = (onF: (v: { data: unknown[]; error: null }) => unknown) =>
    Promise.resolve({ data: [], error: null }).then(onF);
  return chain;
}

vi.mock('@/lib/supabase/admin', () => {
  const chain = makeChain();
  chain.maybeSingle = vi.fn().mockResolvedValue({ data: { id: 'tenant-internal-id', name: 'Demo Business' }, error: null });
  chain.single = vi.fn().mockResolvedValue({ data: { id: 'tenant-internal-id', name: 'Demo Business' }, error: null });
  const { then: _then, ...rest } = chain;
  return { supabaseAdmin: { ...rest, rpc: vi.fn().mockResolvedValue({ data: null, error: null }) } };
});

const mockAuth = vi.mocked(getAuthenticatedUser);
const mockCreateAuthClient = vi.mocked(createAuthClient);
const mockResolveTenantId = vi.mocked(resolveTenantId);
// Mock-registration references (no per-test overrides needed — the vi.mock
// factories above already set the resolved values). Underscore-prefixed per
// the repo's unused-vars convention.
const _mockGetTenantKnowledgeContext = vi.mocked(getTenantKnowledgeContext);
const _mockGetClientMemories = vi.mocked(getClientMemories);
const _mockExtractAndStoreMemories = vi.mocked(extractAndStoreMemories);
const _mockGetVisitorMemories = vi.mocked(getVisitorMemories);
const _mockExtractAndStoreVisitorMemories = vi.mocked(extractAndStoreVisitorMemories);
const _mockTouchVisitorMemory = vi.mocked(touchVisitorMemory);
void _mockGetTenantKnowledgeContext;
void _mockGetClientMemories;
void _mockExtractAndStoreMemories;
void _mockGetVisitorMemories;
void _mockExtractAndStoreVisitorMemories;
void _mockTouchVisitorMemory;

function post(text: string): Promise<Response> {
  return POST(
    new NextRequest('http://localhost:3000/api/client/process-command', {
      method: 'POST',
      body: JSON.stringify({ text }),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // Authenticated client so the full (non-anon) action surface is reachable.
  mockAuth.mockResolvedValue({ user: null, userId: 'client-user', email: 'client@example.com', error: null });
  mockCreateAuthClient.mockResolvedValue({ auth: { getUser: vi.fn() }, ...makeChain() } as never);
  mockResolveTenantId.mockResolvedValue({ data: 'tenant-uuid-123', widget_config: null, error: null });
});

// ─────────────────────────────────────────────────────────────────────────
// Part A — Intent-to-action parity: every utterance resolves to its action.
// ─────────────────────────────────────────────────────────────────────────
describe('Voice-to-UI parity — intent resolves to the expected action', () => {
  for (const parityCase of VOICE_PARITY_CASES) {
    it(`[${parityCase.id}] "${parityCase.utterances[0]}" → ${parityCase.expectedActionType}`, async () => {
      for (const utterance of parityCase.utterances) {
        const res = await post(utterance);
        const body = (await res.json()) as {
          actionType: string;
          payload?: { tab?: string | null; href?: string };
          summary?: string;
        };

        expect(res.status, utterance).toBe(200);
        expect(body.actionType, utterance).toBe(parityCase.expectedActionType);

        if (parityCase.category === 'navigation') {
          // The payload tab must match for every navigation case (persona
          // included — it carries tab:'persona' on the branding dispatch).
          expect(body.payload?.tab, `${utterance} (tab)`).toBe(parityCase.expectedTab);

          if (!parityCase.personaNav) {
            // Non-persona navigation must carry the concrete routable href.
            expect(body.payload?.href, `${utterance} (href)`).toBe(parityCase.expectedHref);
          }

          // A navigation confirmation must never leak a raw path or an ellipsis
          // into the spoken/visual summary (parity with the human-click UX).
          expect(body.summary ?? '', utterance).not.toMatch(/\.{2,}/);
        }
      }
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// Part B — Coverage: every navigable dashboard route has a voice route.
// Reads the REAL page tree off disk so a newly-added page is caught even if
// nobody remembered to update the parity map ("orphaned feature" guard).
// ─────────────────────────────────────────────────────────────────────────
function collectDashboardHrefs(): string[] {
  const dashboardRoot = join(process.cwd(), 'src', 'app', 'client', 'dashboard');
  const hrefs: string[] = [];

  const walk = (dir: string, routeSegments: string[]): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        walk(join(dir, entry.name), [...routeSegments, entry.name]);
      } else if (entry.name === 'page.tsx') {
        hrefs.push(`/client/dashboard${routeSegments.length ? `/${routeSegments.join('/')}` : ''}`);
      }
    }
  };

  walk(dashboardRoot, []);
  return hrefs;
}

describe('Voice-to-UI parity — dashboard route coverage (no orphaned features)', () => {
  it('the parity map lists every dashboard page that exists on disk', () => {
    const onDisk = new Set(collectDashboardHrefs());
    const mapped = new Set(DASHBOARD_ROUTES.map((r) => r.href));

    // Guard against a typo in the map pointing at a non-existent page.
    for (const href of mapped) {
      expect(onDisk.has(href), `parity map references non-existent route: ${href}`).toBe(true);
    }
    // Guard against a real page left without a parity entry.
    for (const href of onDisk) {
      expect(mapped.has(href), `dashboard route has no parity entry: ${href}`).toBe(true);
    }
  });

  it('every navigation-target route has a voice navigation case', () => {
    const navHrefs = new Set(NAVIGATION_PARITY_CASES.map((c) => c.expectedHref));
    const navigable = DASHBOARD_ROUTES.filter((r) => r.navigationTarget).map((r) => r.href);

    for (const href of navigable) {
      expect(navHrefs.has(href), `no voice navigation case for route: ${href}`).toBe(true);
    }
  });

  it('has at least one non-navigation action case (lead actions are covered too)', () => {
    const actionCases = VOICE_PARITY_CASES.filter((c: VoiceParityCase) => c.category === 'action');
    expect(actionCases.length).toBeGreaterThan(0);
  });
});

