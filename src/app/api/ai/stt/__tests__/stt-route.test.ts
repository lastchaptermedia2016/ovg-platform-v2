// src/app/api/ai/stt/__tests__/stt-route.test.ts
//
// Vocabulary-priming contract for the shared STT POST handler in ../route.ts.
// Verifies the Groq `prompt` bias carries our platform + chat-widget brand
// vocabulary (and preserves the reseller client-creation terms) without
// touching reseller-domain code.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../route';
import { resolveVoiceConfig } from '@/lib/ai/voice-config-resolver';

process.env.GROQ_API_KEY = process.env.GROQ_API_KEY || 'test-groq-key';

// ── Groq SDK mock (captures the prompt bias) ─────────────────────────────
let lastGroqPrompt: string | null = null;
vi.mock('groq-sdk', () => {
  class Groq {
    audio = {
      transcriptions: {
        create: vi.fn().mockImplementation((args: { prompt?: string }) => {
          lastGroqPrompt = typeof args?.prompt === 'string' ? args.prompt : null;
          return Promise.resolve({ text: 'open the chat widget' });
        }),
      },
    };
  }
  return { default: Groq, toFile: vi.fn().mockImplementation((blob: Blob) => blob) };
});

// ── Voice-config resolver mock (no Supabase) ─────────────────────────────
vi.mock('@/lib/ai/voice-config-resolver', () => ({
  resolveVoiceConfig: vi.fn().mockResolvedValue({
    apiKey: 'test-groq-key',
    voiceId: 'hannah',
    provider: 'groq',
  }),
}));

const mockResolveVoiceConfig = vi.mocked(resolveVoiceConfig);

function formRequest(file: Blob | null): NextRequest {
  const form = new FormData();
  if (file) form.append('file', file, 'rec.wav');
  form.append('tenantId', 'tenant-1');
  return new NextRequest('http://localhost/api/ai/stt', {
    method: 'POST',
    body: form,
  });
}

const okBlob = () => new Blob([new Uint8Array(20_000)], { type: 'audio/wav' });

beforeEach(() => {
  lastGroqPrompt = null;
  mockResolveVoiceConfig.mockResolvedValue({
    apiKey: 'test-groq-key',
    voiceId: 'hannah',
    provider: 'groq',
  });
});

describe('POST /api/ai/stt — Whisper vocabulary priming', () => {
  it('primes the prompt with platform + chat-widget brand vocabulary', async () => {
    const res = await POST(formRequest(okBlob()));
    expect(res.status).toBe(200);

    const body = (await res.json()) as { text?: string };
    expect(body.text).toBe('open the chat widget');

    expect(lastGroqPrompt).not.toBeNull();
    // Chat-widget / platform anchors.
    expect(lastGroqPrompt).toContain('Zeeder');
    expect(lastGroqPrompt).toContain('Zeeder Engage');
    expect(lastGroqPrompt).toContain('chat widget');
    expect(lastGroqPrompt).toContain('AI assistant');
    expect(lastGroqPrompt).toContain('PTT');
    expect(lastGroqPrompt).toContain('Supabase');
    expect(lastGroqPrompt).toContain('Next.js');
  });

  it('preserves the reseller client-creation vocabulary on the shared endpoint', async () => {
    await POST(formRequest(okBlob()));

    expect(lastGroqPrompt).not.toBeNull();
    expect(lastGroqPrompt).toContain('LCM');
    expect(lastGroqPrompt).toContain('Last Chapter Media');
    expect(lastGroqPrompt).toContain('industry');
    expect(lastGroqPrompt).toContain('website');
  });

  it('rejects micro-recordings with 422 before touching Groq', async () => {
    const tiny = new Blob([new Uint8Array(1_000)], { type: 'audio/wav' });
    const res = await POST(formRequest(tiny));
    expect(res.status).toBe(422);
  });
});
