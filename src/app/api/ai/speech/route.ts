import Groq from "groq-sdk";
import { resolveVoiceConfig } from '@/lib/ai/voice-config-resolver';
import { getTtsCache, getTtsCacheKey, setTtsCache } from '@/lib/ai/tts-cache';

export const dynamic = "force-dynamic"; // Prevents build-time API key errors

// ──────────────────────────── CORS ─────────────────────────────────────────
// Public TTS endpoint consumed by cross-origin widget embeds.
const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function corsResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
    },
  });
}

const DEFAULT_VOICE = "hannah";
const DEFAULT_PROVIDER = "groq";
const TTS_MODEL = "orpheus-english";

/**
 * Maps legacy / ambiguous caller-supplied model ids to the canonical Groq TTS
 * model. The Reseller (Hannah) surface historically sent `orpheus-v1`, which is
 * not a valid Groq model id and triggered a 500 from upstream. Centralizing the
 * alias map here means no caller can break TTS by passing a bad model string.
 */
const LEGACY_MODEL_ALIASES: Record<string, string> = {
  "orpheus-v1": TTS_MODEL,
  "orpheus": TTS_MODEL,
  "canopylabs/orpheus-v1-english": TTS_MODEL,
};

/** Canonical Groq TTS models accepted by the upstream API. */
const KNOWN_TTS_MODELS = new Set<string>([
  TTS_MODEL,
  "canopylabs/orpheus-arabic-saudi",
  "playai-tts",
  "playai-tts-arabic",
]);

/**
 * Normalize an incoming `model` value to a valid Groq TTS model id.
 *
 * Resolution order:
 * 1. Empty / undefined → canonical default.
 * 2. Known alias (`orpheus-v1`, etc.) → canonical id.
 * 3. Already a known valid model → passed through unchanged.
 * 4. Anything else (unrecognized) → canonical default (fail-safe, never 500).
 */
function normalizeModel(model?: string): string {
  if (!model || !model.trim()) return TTS_MODEL;
  const trimmed = model.trim();
  if (LEGACY_MODEL_ALIASES[trimmed]) return LEGACY_MODEL_ALIASES[trimmed];
  if (KNOWN_TTS_MODELS.has(trimmed)) return trimmed;
  return TTS_MODEL;
}

interface SpeechInput {
  text?: string;
  voice?: string;
  model?: string;
  resellerSlug?: string;
  tenantId?: string;
  provider?: string;
  metadata?: { resellerSlug?: string; [key: string]: unknown };
}

/**
 * Single source of truth for TTS across every surface (Client / Zeeder and
 * Reseller / Hannah). Generates Orpheus WAV audio from `text` using the
 * requested `voice` (defaulting to "hannah").
 *
 * Accepts either a JSON POST body or GET query parameters so non-JSON
 * consumers (e.g. <audio src="/api/ai/speech?text=...&voice=hannah">) work too.
 * The legacy `metadata.resellerSlug` / top-level `resellerSlug` fields are
 * preserved for backward compatibility with the existing Reseller callers.
 */
async function generateSpeech(input: SpeechInput): Promise<Response> {
  const text = input.text?.trim();
  if (!text) {
    return new Response(JSON.stringify({ error: "Text is required" }), {
      status: 400,
    });
  }

  const model = normalizeModel(input.model);
  const resolved = await resolveVoiceConfig({
    tenantId: input.tenantId,
    resellerSlug: input.resellerSlug ?? input.metadata?.resellerSlug,
  });

  const voice = input.voice || resolved.voiceId || DEFAULT_VOICE;
  const apiKey = resolved.apiKey || process.env.GROQ_API_KEY;
  const provider = resolved.provider || input.provider || DEFAULT_PROVIDER;
  const activeResellerSlug = input.resellerSlug ?? input.metadata?.resellerSlug;

  if (!apiKey) {
    console.error("[API] Speech generation failed: GROQ_API_KEY is not configured.");
    return new Response(JSON.stringify({ error: "Speech service unavailable" }), {
      status: 503,
    });
  }

  const cacheKey = getTtsCacheKey(text, voice, provider, activeResellerSlug);
  const cached = getTtsCache(cacheKey);
  if (cached) {
    return new Response(cached as unknown as BodyInit, {
      headers: {
        "Content-Type": "audio/wav",
        "Content-Length": cached.length.toString(),
        "Cache-Control": "public, max-age=3600",
        "X-TTS-Cache": "HIT",
      },
    });
  }

  try {
    const groq = new Groq({ apiKey });

    console.log('[API] TTS request:', { model, voice, textLength: text.length });

    const wav = await groq.audio.speech.create({
      model: 'canopylabs/orpheus-v1-english',
      voice,
      response_format: "wav",
      input: text,
    });

    const buffer = Buffer.from(await wav.arrayBuffer());
    setTtsCache(cacheKey, buffer);

    return new Response(buffer as unknown as BodyInit, {
      headers: {
        "Content-Type": "audio/wav",
        "Content-Length": buffer.length.toString(),
        "Cache-Control": "public, max-age=3600",
        "X-TTS-Cache": "MISS",
      },
    });
  } catch (error) {
    const status =
      typeof (error as { status?: number })?.status === "number"
        ? (error as { status: number }).status
        : 500;
    const message =
      error instanceof Error
        ? error.message
        : typeof error === "string"
          ? error
          : "Unknown speech generation error";
    console.error("[API] Speech generation failed:", { model, voice, message, status, error });
    return new Response(
      JSON.stringify({ error: "Speech generation failed", detail: message }),
      { status: status >= 400 && status < 600 ? status : 500 },
    );
  }
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req: Request) {
  let input: SpeechInput = {};
  try {
    input = (await req.json()) as SpeechInput;
  } catch {
    return corsResponse({ error: "Invalid JSON body" }, 400);
  }
  const response = await generateSpeech(input);
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', '*');
  return new Response(response.body, { status: response.status, headers });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const input: SpeechInput = {
    text: url.searchParams.get("text") ?? undefined,
    voice: url.searchParams.get("voice") ?? undefined,
    model: url.searchParams.get("model") ?? undefined,
    resellerSlug: url.searchParams.get("resellerSlug") ?? undefined,
    tenantId: url.searchParams.get("tenantId") ?? undefined,
  };
  const response = await generateSpeech(input);
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', '*');
  return new Response(response.body, { status: response.status, headers });
}
