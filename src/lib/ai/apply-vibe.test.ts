// Unit tests for the in-process AI Vibe Generator (@/lib/ai/apply-vibe).
// Groq is mocked so tests are deterministic and never hit the network.

const { createMock } = vi.hoisted(() => ({ createMock: vi.fn() }));

vi.mock('groq-sdk', () => ({
  default: class Groq {
    chat = { completions: { create: createMock } };
  },
}));

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { applyVibe, ApplyVibeRequestSchema, WidgetConfigSchema } from './apply-vibe';

const VALID_BRANDING = {
  branding: {
    headerBackground: '#123456',
    headerBackgroundType: 'gradient' as const,
    headerGradientStart: '#ff00aa',
    headerGradientEnd: '#0097b2',
    headerImage: 'neon skyline',
    // NOTE: schema validates .min(0).max(1) BEFORE clamping, so out-of-range
    // fixtures must stay within [0,1]. 0.99 → clamped down to 0.95.
    headerOpacity: 0.99,
    footerBackground: '#0a0a0a',
    footerBackgroundType: 'solid' as const,
    footerGradientStart: '#000000',
    footerGradientEnd: '#111111',
    footerImage: 'grid floor',
    footerOpacity: 0.02, // out of range → must clamp to 0.6
    logoUrl: 'https://example.com/logo.png',
  },
  features: {
    aiInsightBadge: true,
    aiDesignMirror: false,
    customCss: false,
  },
  vibeName: 'Cyber Neon',
  vibeDescription: 'A high-contrast neon aesthetic.',
};

function mockCompletion(content: string | null): void {
  createMock.mockResolvedValue({
    choices: [{ message: { content } }],
  });
}

describe('applyVibe', () => {
  const originalApiKey = process.env.GROQ_API_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GROQ_API_KEY = 'test-groq-key';
  });

  afterEach(() => {
    if (originalApiKey === undefined) {
      delete process.env.GROQ_API_KEY;
    } else {
      process.env.GROQ_API_KEY = originalApiKey;
    }
  });

  it('returns a schema-valid widget config and clamps opacity into [0.6, 0.95]', async () => {
    mockCompletion(JSON.stringify(VALID_BRANDING));

    const result = await applyVibe({ vibe: 'cyberpunk neon' });

    // Contract: validated config + metadata
    expect(WidgetConfigSchema.safeParse(result.widgetConfig).success).toBe(true);
    expect(result.metadata.vibe).toBe('cyberpunk neon');
    expect(result.metadata.model).toBe('openai/gpt-oss-20b');
    expect(result.metadata.processedAt).toBeTruthy();

    // Opacity clamping
    expect(result.widgetConfig.branding.headerOpacity).toBe(0.95);
    expect(result.widgetConfig.branding.footerOpacity).toBe(0.6);
  });

  it('emits valid 6-digit HEX color codes in all branding color fields', async () => {
    mockCompletion(JSON.stringify(VALID_BRANDING));

    const { widgetConfig } = await applyVibe({ vibe: 'cyberpunk neon' });
    const HEX = /^#[0-9a-fA-F]{6}$/;

    expect(widgetConfig.branding.headerBackground).toMatch(HEX);
    expect(widgetConfig.branding.headerGradientStart).toMatch(HEX);
    expect(widgetConfig.branding.headerGradientEnd).toMatch(HEX);
    expect(widgetConfig.branding.footerBackground).toMatch(HEX);
    expect(widgetConfig.branding.footerGradientStart).toMatch(HEX);
    expect(widgetConfig.branding.footerGradientEnd).toMatch(HEX);
  });

  it('passes websiteUrl and industry context through to the Groq request', async () => {
    mockCompletion(JSON.stringify(VALID_BRANDING));

    await applyVibe({
      vibe: 'minimalist',
      tenantId: '00000000-0000-4000-8000-000000000000',
      websiteUrl: 'https://example.com',
      industry: 'RETAIL',
    });

    expect(createMock).toHaveBeenCalledTimes(1);
    const call = createMock.mock.calls[0]?.[0] as {
      messages: { role: string; content: string }[];
    };
    const userMessage = call.messages.find((m) => m.role === 'user')?.content ?? '';
    expect(userMessage).toContain('https://example.com');
    expect(userMessage).toContain('RETAIL');
    expect(userMessage).toContain('minimalist');
  });

  it('throws when the model returns empty content', async () => {
    mockCompletion(null);
    await expect(applyVibe({ vibe: 'x' })).rejects.toThrow('AI returned empty response');
  });

  it('throws when the model returns malformed JSON', async () => {
    mockCompletion('{not-json');
    await expect(applyVibe({ vibe: 'x' })).rejects.toThrow('AI returned malformed JSON');
  });

  it('throws when the response fails the widget config schema', async () => {
    mockCompletion(JSON.stringify({ branding: {}, vibeName: 'broken' }));
    await expect(applyVibe({ vibe: 'x' })).rejects.toThrow(
      'AI response does not match required schema',
    );
  });

  it('throws AI service not configured when GROQ_API_KEY is missing', async () => {
    delete process.env.GROQ_API_KEY;
    await expect(applyVibe({ vibe: 'x' })).rejects.toThrow('AI service not configured');
    expect(createMock).not.toHaveBeenCalled();
  });
});

describe('ApplyVibeRequestSchema', () => {
  it('accepts a minimal vibe payload', () => {
    expect(ApplyVibeRequestSchema.safeParse({ vibe: 'cyberpunk neon' }).success).toBe(true);
  });

  it('rejects an empty vibe', () => {
    expect(ApplyVibeRequestSchema.safeParse({ vibe: '' }).success).toBe(false);
  });

  it('rejects a vibe longer than 500 chars', () => {
    expect(ApplyVibeRequestSchema.safeParse({ vibe: 'a'.repeat(501) }).success).toBe(false);
  });
});
