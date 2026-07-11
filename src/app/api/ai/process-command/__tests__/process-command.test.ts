// src/app/api/ai/process-command/__tests__/process-command.test.ts
//
// Deterministic integration suite for the real POST handler in ../route.ts.
// Groq is fully mocked; Supabase clients are mocked with a thenable fluent
// chain so every terminal call (single / maybeSingle / limit / direct await)
// resolves predictably and the widget_config write is captured.

process.env.GROQ_API_KEY = process.env.GROQ_API_KEY || 'test-groq-key';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../route';
import * as fixtures from './process-command.fixtures';

const TENANT_ID = 'eca76a5b-de2a-41c9-b5e0-5ae7412ef835';
const RESOLVED_RESELLER_ID = 'reseller-uuid-fixed';

// What resolveResellerId() returns. Null in Group C to exercise the fallback.
let mockResellerResolutionValue: string | null = RESOLVED_RESELLER_ID;
// Canned Groq output (AIResponseSchema-shaped). Null => Groq not invoked.
let cannedGroqResponse: unknown = null;
// Captured DB writes (widget_config update + any others), in order.
let capturedUpdates: Record<string, unknown>[] = [];

/**
 * A fluent, thenable Supabase query mock. Every builder method returns the
 * chain; terminal methods (single / maybeSingle / limit) and a direct await
 * all resolve to the same { data, error } terminal. `update` records its
 * payload so we can assert on the persisted widget_config.
 */
function createMockChain(): Record<string, unknown> {
  const terminal = {
    data: { id: TENANT_ID, reseller_id: RESOLVED_RESELLER_ID },
    error: null,
  };
  const chain: Record<string, unknown> = {};
  const builderMethods = ['from', 'select', 'eq', 'or', 'in', 'order'];
  for (const m of builderMethods) {
    chain[m] = vi.fn().mockImplementation(() => chain);
  }
  chain.update = vi.fn().mockImplementation((payload: Record<string, unknown>) => {
    capturedUpdates.push(payload);
    return chain;
  });
  chain.maybeSingle = vi.fn().mockImplementation(() => Promise.resolve(terminal));
  chain.single = vi.fn().mockImplementation(() => Promise.resolve(terminal));
  chain.limit = vi.fn().mockImplementation(() => Promise.resolve({ data: [], error: null }));
  return chain;
}

// The route calls `new Groq({ apiKey })`, so the default export MUST be a real
// class/function (arrow functions cannot be used with `new`). The class field
// initializer runs at construction time — by then `cannedGroqResponse` is set.
vi.mock('groq-sdk', () => {
  class Groq {
    chat = {
      completions: {
        create: vi.fn().mockImplementation(() =>
          Promise.resolve({
            choices: [{ message: { content: JSON.stringify(cannedGroqResponse) } }],
          })
        ),
      },
    };
  }
  return { default: Groq };
});

// Reseller resolution + telemetry queries use the *server* Supabase client.
// The route imports `createClient as createSupabaseClient`, so the mock must
// export the real named binding `createClient`.
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockImplementation(createMockChain),
}));

// The tenant widget_config write + tenant/reseller lookups use createAuthClient,
// and the SYSTEM_UPDATE_BRANDING gate uses getAuthenticatedUser — BOTH from
// @/lib/auth/server (this is the module the draft mocked incorrectly).
vi.mock('@/lib/auth/server', () => ({
  createAuthClient: vi.fn().mockImplementation(createMockChain),
  getAuthenticatedUser: vi.fn().mockReturnValue({ userId: 'test-user', error: null }),
}));

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  },
}));

vi.mock('@/lib/db/resolve-reseller', () => ({
  resolveResellerId: vi.fn().mockImplementation(() => Promise.resolve(mockResellerResolutionValue)),
}));

vi.mock('@/lib/checkTenantAiExecutePermission', () => ({
  checkTenantAiExecutePermission: vi.fn().mockResolvedValue(true),
}));

function postCommand(userCommand: string, extra: Record<string, unknown> = {}): Promise<Response> {
  return POST(
    new NextRequest('http://localhost:3000/api/ai/process-command', {
      method: 'POST',
      body: JSON.stringify({
        resellerId: 'active-slug',
        userCommand,
        tenantContext: { tenantId: TENANT_ID },
        ...extra,
      }),
    })
  );
}

function capturedWidgetConfig(): Record<string, unknown> | null {
  const write = capturedUpdates.find((u) => u && 'widget_config' in u);
  return write ? (write.widget_config as Record<string, unknown>) : null;
}

describe('AI Process-Command Comprehensive Action Audit Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedUpdates = [];
    cannedGroqResponse = null;
    mockResellerResolutionValue = RESOLVED_RESELLER_ID;
  });

  describe('Group A — LLM Parsing (Groq mocked, real route)', () => {
    Object.entries(fixtures.CAPABILITY_FIXTURES).forEach(([capabilityName, testCases]) => {
      testCases.forEach((testCase, index) => {
        it(`evaluates [${capabilityName} - case ${index}]: "${testCase.example}"`, async () => {
          cannedGroqResponse = testCase.cannedResponse;

          const response = await postCommand(testCase.example);
          const body = await response.json();

          expect(response.status).toBe(200);
          expect(body.actionType).toBe('SYSTEM_UPDATE_BRANDING');

          if (capabilityName === 'addons' || capabilityName === 'customCssSandbox') {
            // Regression gate for the features projection fix (Group D).
            const config = capturedWidgetConfig();
            expect(config).not.toBeNull();
            expect(config).toHaveProperty('features');
            expect(config!.features).toMatchObject(testCase.expectedPersisted.features as object);
          } else if (!testCase.llmDependent) {
            const config = capturedWidgetConfig();
            expect(config).not.toBeNull();
            expect(config).toMatchObject(testCase.expectedPersisted);
          }
        });
      });
    });
  });

  describe('Group B — Pre-LLM Regex Routers', () => {
    fixtures.PRE_LLM_THEME_FIXTURES.forEach(({ input, expectedTheme }) => {
      it(`short-circuits matching theme alias: "${input}"`, async () => {
        const response = await postCommand(input);
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.actionType).toBe('SYSTEM_APPLY_BRANDING_THEME');
        expect(body.payload.theme).toBe(expectedTheme);
      });
    });

    fixtures.PRE_LLM_HELP_FIXTURES.forEach((input) => {
      it(`intercepts help query: "${input}"`, async () => {
        // The help fast-path requires contextCapabilities to be present.
        const response = await postCommand(input, {
          contextCapabilities: { header: { description: 'Change the header', examples: ['x'] } },
        });
        const body = await response.json();
        expect(body.actionType).toBe('SYSTEM_HELP');
      });
    });

    fixtures.PRE_LLM_TELEMETRY_FIXTURES.forEach((input) => {
      it(`intercepts telemetry request: "${input}"`, async () => {
        // Telemetry branch is gated on !tenantContext.tenantId, so omit it.
        const response = await postCommand(input, { tenantContext: {} });
        const body = await response.json();
        expect(body.actionType).toBe('SYSTEM_TELEMETRY');
      });
    });
  });

  describe('Group C — Stale-Slug Fallback', () => {
    it('recovers reseller via tenantContext when primary slug lookup fails', async () => {
      mockResellerResolutionValue = null; // Kill primary resolveResellerId()

      const response = await postCommand('Apply the corporate legal theme');
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.actionType).toBe('SYSTEM_APPLY_BRANDING_THEME');
      expect(body.payload.theme).toBe('legal');
    });
  });
});
