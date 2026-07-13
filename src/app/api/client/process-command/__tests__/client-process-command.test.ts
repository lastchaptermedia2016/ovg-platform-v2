// src/app/api/client/process-command/__tests__/client-process-command.test.ts
//
// Deterministic suite for the client-surface POST handler in ../route.ts.
// Auth is mocked via getAuthenticatedUser; the registry + intent parser are
// exercised with real code so the surface-isolation contract is verified.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../route';
import { getAuthenticatedUser } from '@/lib/auth/server';

process.env.GROQ_API_KEY = process.env.GROQ_API_KEY || 'test-groq-key';

// The route calls `new Groq({ apiKey })`, so the default export MUST be a real
// class (arrow functions cannot be used with `new`). The class field
// initializer runs at construction time — by then `cannedGroqResponse` is set.
let cannedGroqResponse: unknown = null;
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

vi.mock('@/lib/auth/server', () => ({
  getAuthenticatedUser: vi.fn(),
}));

const mockAuth = vi.mocked(getAuthenticatedUser);

beforeEach(() => {
  cannedGroqResponse = null;
});

function post(text: string, extra: Record<string, unknown> = {}): Promise<Response> {
  return POST(
    new NextRequest('http://localhost:3000/api/client/process-command', {
      method: 'POST',
      body: JSON.stringify({ text, ...extra }),
    }),
  );
}

const RESELLER_VERBS = ['delete client', 'filter clients', 'bulk delete', 'reseller'];

describe('POST /api/client/process-command', () => {
  beforeEach(() => {
    mockAuth.mockResolvedValue({
      user: null,
      userId: 'client-user',
      email: 'client@example.com',
      error: null,
    });
  });

  it('should short-circuit help intents with isolated client capabilities', async () => {
    const response = await post('what can you do?');
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.actionType).toBe('SYSTEM_HELP');
    expect(body.payload.brandingCapabilities).toEqual({});

    const commands: string[] = body.payload.availableCommands;
    expect(Array.isArray(commands)).toBe(true);
    expect(commands.length).toBeGreaterThan(0);

    // Zero reseller verbs must leak into the client help list.
    for (const verb of RESELLER_VERBS) {
      expect(commands.some(c => c.toLowerCase().includes(verb))).toBe(false);
    }

    // The spoken hint must NOT invite a help synonym ("List capabilities")
    // that would re-match the help regex and create a repeat loop.
    expect(body.summary).not.toMatch(/list capabilities/i);
    expect(body.summary).toMatch(/update my branding|show my telemetry/i);
  });

  it('should deterministically answer identity questions as ZEEDER without an LLM round-trip', async () => {
    // No canned Groq response — the guard must bypass the LLM entirely.
    const variants = ['what is your name', "what's your name", 'who are you', 'your name'];

    for (const text of variants) {
      const response = await post(text);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.actionType).toBe('CLIENT_NOP');
      expect(body.summary).toBe("I'm ZEEDER, your Client Portal assistant.");
    }
  });

  it('should map valid client intents to their respective SYSTEM_* actions', async () => {
    const branding = await post('update my branding');
    const b = await branding.json();
    expect(b.actionType).toBe('SYSTEM_UPDATE_BRANDING');

    const telemetry = await post('show my telemetry');
    const t = await telemetry.json();
    expect(t.actionType).toBe('SYSTEM_TELEMETRY');
  });

  it('should drop unmatched or unmapped client intents to CLIENT_NOP', async () => {
    const response = await post('make me a sandwich');
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.actionType).toBe('CLIENT_NOP');
  });

  it('should gracefully pivot off-topic questions back to portal capabilities', async () => {
    cannedGroqResponse = {
      actionType: 'CLIENT_NOP',
      summary:
        "I'm not sure about the weather, but I can help you update your branding or check your telemetry signals!",
    };

    const res = await post('how is the weather today?');
    const body = await res.json();

    // It shouldn't execute an action or break the view.
    expect(res.status).toBe(200);
    expect(body.actionType).toBe('CLIENT_NOP');

    // It should conversationalize the border enforcement.
    expect(body.summary).not.toContain('Error');
    expect(body.summary).toMatch(/branding|telemetry|portal/i);
  });

  it('should surface the LLM conversational gradient reply instead of silently dropping it (off-page → SYSTEM_UPDATE_BRANDING)', async () => {
    cannedGroqResponse = {
      actionType: 'SYSTEM_UPDATE_BRANDING',
      summary:
        "I've navigated you to your Studio dashboard! Our header backgrounds currently support beautiful, crisp solid colors rather than multi-color gradients. Which solid color should we set for your header background instead?",
    };

    const res = await post('make my header a gradient blue and green');
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.actionType).toBe('SYSTEM_UPDATE_BRANDING');
    expect(body.summary).toMatch(/gradients?/i);
    expect(body.summary).toMatch(/solid color/i);
  });

  it('should surface the LLM conversational gradient reply on-page as CLIENT_NOP', async () => {
    cannedGroqResponse = {
      actionType: 'CLIENT_NOP',
      summary:
        "Our header backgrounds currently support beautiful, crisp solid colors rather than multi-color gradients. Which solid color should we set for your header instead?",
    };

    const res = await post('set my header to a gradient', {
      currentPath: '/client/dashboard/studio/branding',
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.actionType).toBe('CLIENT_NOP');
    expect(body.summary).toMatch(/gradients?/i);
  });

  it('should degrade to CLIENT_NOP when the semantic fallback returns malformed JSON', async () => {
    cannedGroqResponse = undefined;

    const res = await post('tell me a joke');
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.actionType).toBe('CLIENT_NOP');
    expect(body.summary).not.toContain('Error');
  });

  it('should return a 401 when getAuthenticatedUser returns null', async () => {
    mockAuth.mockResolvedValue({
      user: null,
      userId: null,
      email: null,
      error: new Error('Unauthorized'),
    });

    const response = await post('what can you do?');
    expect(response.status).toBe(401);
  });

  it('should correctly explain system concepts like the widget body using the glossary', async () => {
    cannedGroqResponse = {
      actionType: 'CLIENT_NOP',
      summary: 'The widget body is the main canvas where your chat bubbles render. Would you like me to take you to the Branding Studio so we can look at it?',
    };

    const res = await post('What is a widget body?');
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.actionType).toBe('CLIENT_NOP');

    expect(body.summary).toMatch(/canvas|chat bubbles|render/i);
    expect(body.summary).toMatch(/branding|studio|configure/i);
  });

  it('should use screen-aware language when currentPath indicates the user is already on the Branding Studio', async () => {
    cannedGroqResponse = {
      actionType: 'CLIENT_NOP',
      summary: 'Since we\'re looking right at the Branding Studio together on your screen, the widget body is this main canvas area where your text chat bubbles show up. Everything you change here updates in real time!',
    };

    const res = await post('What is a widget body?', {
      currentPath: '/client/dashboard/studio/branding',
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.actionType).toBe('CLIENT_NOP');
    expect(body.summary).toMatch(/looking right at|together on your screen/i);
    expect(body.summary).toMatch(/widget body|canvas|chat bubbles/i);
    expect(body.summary).not.toMatch(/open up the branding studio|take you to/i);
  });

  it('should offer to navigate to the Branding Studio when the user is on a different page', async () => {
    cannedGroqResponse = {
      actionType: 'CLIENT_NOP',
      summary: 'The widget body is the canvas where bubbles render. Would you like me to open up the Branding Studio so we can look at it?',
    };

    const res = await post('What is a widget body?', {
      currentPath: '/client/dashboard',
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.actionType).toBe('CLIENT_NOP');
    expect(body.summary).toMatch(/canvas|bubbles|render/i);
    expect(body.summary).toMatch(/open up the branding studio|take you to/i);
  });
});

describe('POST /api/client/process-command - Help Boundary Coverage', () => {
  beforeEach(() => {
    mockAuth.mockResolvedValue({
      user: null,
      userId: 'client-user',
      email: 'client@example.com',
      error: null,
    });
  });

  it('should resolve natural phrase "list capabilities" to SYSTEM_HELP', async () => {
    const response = await post('list capabilities');
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.actionType).toBe('SYSTEM_HELP');
    expect(body.payload.brandingCapabilities).toEqual({});
  });

  it('should NOT intercept "show my telemetry" with the help regex', async () => {
    const response = await post('show my telemetry');
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.actionType).toBe('SYSTEM_TELEMETRY');
  });
});

describe('POST /api/client/process-command - Persona Mode Execution', () => {
  beforeEach(() => {
    mockAuth.mockResolvedValue({
      user: null,
      userId: 'client-user',
      email: 'client@example.com',
      error: null,
    });
  });

  it('should resolve a sales persona directive to SYSTEM_UPDATE_BRANDING with aiPersona.personaMode', async () => {
    const res = await post("Jane's persona mode to sales");
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.actionType).toBe('SYSTEM_UPDATE_BRANDING');
    expect(body.payload.aiPersona).toEqual({ personaMode: 'sales' });
  });

  it('should resolve a concierge persona directive to SYSTEM_UPDATE_BRANDING with aiPersona.personaMode', async () => {
    const res = await post('switch persona to concierge');
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.actionType).toBe('SYSTEM_UPDATE_BRANDING');
    expect(body.payload.aiPersona).toEqual({ personaMode: 'concierge' });
  });

  it('should preserve existing aiPersona subkeys when injecting personaMode', async () => {
    // The caller-supplied payload already carried an aiPersona subkey; the
    // injected personaMode must merge rather than clobber it.
    const res = await post('set my persona mode to sales', {
      payload: { aiPersona: { existingKey: 'keep-me' } },
    });
    const body = await res.json();

    expect(body.actionType).toBe('SYSTEM_UPDATE_BRANDING');
    expect(body.payload.aiPersona).toEqual({
      existingKey: 'keep-me',
      personaMode: 'sales',
    });
  });

  it('should NOT falsely resolve the bare word "sales" to a persona change', async () => {
    // "sales" alone has no mode-intent phrase, so it must not trigger persona
    // resolution. parseIntent returns null and the request falls through to the
    // semantic fallback, which degrades to CLIENT_NOP.
    const res = await post('sales');
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.actionType).toBe('CLIENT_NOP');
    expect(body.payload.aiPersona).toBeUndefined();
  });

  it('should NOT mistake an educational "what is a persona" question for a persona change', async () => {
    cannedGroqResponse = {
      actionType: 'CLIENT_NOP',
      summary: 'A persona mode shapes how your AI assistant talks to customers.',
    };

    const res = await post('what is a persona?');
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.actionType).toBe('CLIENT_NOP');
    expect(body.summary).toMatch(/persona/i);
    expect(body.payload.aiPersona).toBeUndefined();
  });
});

describe('POST /api/client/process-command - Persona Intent Without Target Mode', () => {
  beforeEach(() => {
    mockAuth.mockResolvedValue({
      user: null,
      userId: 'client-user',
      email: 'client@example.com',
      error: null,
    });
  });

  it('should route "update persona mode" (off-studio) to SYSTEM_UPDATE_BRANDING with a mode prompt', async () => {
    const res = await post('update persona mode', {
      currentPath: '/client/dashboard',
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.actionType).toBe('SYSTEM_UPDATE_BRANDING');
    expect(body.payload.aiPersona).toBeUndefined();
    expect(body.summary).toMatch(/studio dashboard|branding and ai persona/i);
    expect(body.summary).toMatch(/sales or concierge/i);
  });

  it('should return CLIENT_NOP for "update persona mode" when already on the Studio page', async () => {
    const res = await post('change my persona', {
      currentPath: '/client/dashboard/studio/branding',
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.actionType).toBe('CLIENT_NOP');
    expect(body.summary).toMatch(/looking right at your studio/i);
    expect(body.summary).toMatch(/sales or concierge/i);
  });

  it('should still resolve a complete persona command (with target) normally', async () => {
    const res = await post('update persona mode to sales');
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.actionType).toBe('SYSTEM_UPDATE_BRANDING');
    expect(body.payload.aiPersona).toEqual({ personaMode: 'sales' });
  });
});
