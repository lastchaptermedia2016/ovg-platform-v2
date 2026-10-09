import Groq, { toFile } from "groq-sdk";
import { resolveVoiceConfig } from '@/lib/ai/voice-config-resolver';

export const dynamic = 'force-dynamic';

/**
 * Whisper vocabulary priming for the shared STT path (`/api/ai/stt`).
 *
 * Groq's Whisper exposes the `prompt` field as its decoder-biasing surface.
 * Whisper seeds its decoder
 * with the prompt as an in-context prior, so listing our real brand spellings
 * and product vocabulary here shifts next-token attention away from generic
 * en-US dictionary defaults that would otherwise warp "Zeeder" → "Zeta"/"Cedar"
 * and "Supabase" → "super base".
 *
 * Two vocabularies are merged because this endpoint is shared:
 *   - Platform + chat-widget surface (public embed via `useAnonVoice`).
 *   - Reseller / voice-driven client-creation fields (via `use-voice-command`
 *     and `UniversalCommandModal`).
 *
 * Kept well under Groq's ~224-token prompt ceiling so the bias is never silently
 * truncated.
 */
const STT_VOCABULARY_PROMPT = [
  // Platform + product brand anchors (chat-widget surface).
  'Zeeder',
  'Zeeder Engage',
  'Omniverge Global',
  'OVG',
  'OVG platform',
  'chat widget',
  'AI assistant',
  'push-to-talk',
  'PTT',
  'Supabase',
  'Next.js',
  // Reseller / voice-driven client-creation field vocabulary (shared endpoint).
  'LCM',
  'Last Chapter Media',
  'client name',
  'industry',
  'email',
  'website',
].join(', ');

interface GroqError {
  status?: number;
  message?: string;
  code?: string;
  name?: string;
  stack?: string;
}

function jsonResponse(
  body: unknown,
  status: number,
  extraHeaders?: Record<string, string>
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...(extraHeaders ?? {}),
    },
  });
}

function safeStatus(raw: unknown, fallback = 500): number {
  return typeof raw === 'number' && raw >= 400 && raw < 600 ? raw : fallback;
}

function extractGroqError(rawMessage: string): { message: string; type: string | null } {
  const match = rawMessage.match(/^\d+\s+(\{[\s\S]*\})$/);
  if (!match) {
    return { message: rawMessage, type: null };
  }

  try {
    const parsed = JSON.parse(match[1]) as {
      error?: { message?: string; type?: string };
    };
    const innerMessage = parsed.error?.message;
    if (typeof innerMessage === 'string' && innerMessage.length > 0) {
      return {
        message: innerMessage,
        type: parsed.error?.type ?? null,
      };
    }
  } catch {
    // JSON parse failed — fall through to raw message
  }

  return { message: rawMessage, type: null };
}

export async function POST(req: Request) {
  if (!process.env.GROQ_API_KEY) {
    console.error('[STT] ❌ GROQ_API_KEY is not configured');
    return jsonResponse(
      { error: 'STT service is not configured: missing GROQ_API_KEY' },
      500
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch (parseErr: unknown) {
    const message = parseErr instanceof Error ? parseErr.message : 'Failed to parse multipart payload';
    console.error('[STT] ❌ Multipart parse error:', message);
    return jsonResponse({ error: `Malformed audio upload: ${message}` }, 400);
  }

  const file = formData.get("file") as File;
  const rawTenantId = formData.get("tenantId");
  const tenantId = typeof rawTenantId === "string" && rawTenantId.length > 0 ? rawTenantId : null;

  console.log('[STT] Received file:', {
    name: file?.name,
    type: file?.type,
    size: file?.size,
  });

  if (!file) {
    console.error('[STT] ❌ No file received in form payload');
    return jsonResponse({ error: 'No audio file received' }, 400);
  }

  if (file.size < 12000) {
    console.warn('[STT] ⚠️ Micro-recording rejected:', {
      name: file.name,
      type: file.type,
      size: file.size,
    });
    return jsonResponse(
      {
        error: 'Recording too short',
        message: 'Audio chunk contains no decodable voice data. Please hold the button down to speak your command.',
      },
      422
    );
  }

  const rawResellerSlug = formData.get("resellerSlug");
  const resellerSlug = typeof rawResellerSlug === "string" && rawResellerSlug.length > 0 ? rawResellerSlug : null;

  const resolved = await resolveVoiceConfig({
    tenantId: tenantId || undefined,
    resellerSlug: resellerSlug || undefined,
  });

  const groqApiKey = resolved.apiKey || process.env.GROQ_API_KEY;

  if (!groqApiKey) {
    console.error('[STT] ❌ GROQ_API_KEY is not configured');
    return jsonResponse(
      { error: 'STT service is not configured: missing GROQ_API_KEY' },
      500
    );
  }

  try {
    const arrayBuffer = await file.arrayBuffer();

    console.log('[STT] ArrayBuffer size:', arrayBuffer.byteLength);

    const uploadable = await toFile(
      new Blob([arrayBuffer], { type: file.type }),
      file.name,
      { type: file.type }
    );

    const groq = new Groq({ apiKey: groqApiKey });

    const transcription = await groq.audio.transcriptions.create({
      file: uploadable,
      model: "whisper-large-v3-turbo",
      prompt: STT_VOCABULARY_PROMPT,
      response_format: "json",
      // temperature 0.0 = greedy decoding: the single most-likely token each
      // step. Any >0 introduces sampling randomness, which on quiet/trailing
      // audio chunks makes Whisper hallucinate filler or foreign characters.
      temperature: 0.0,
      // Pin the decoder to English so it never drifts into another script
      // (a common source of stray non-Latin glyphs in the transcript).
      language: "en",
    });

    return jsonResponse(
      { text: transcription.text },
      200,
      { 'X-Streaming-Response': 'true' }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const groqError = error as GroqError;
    const status = safeStatus(groqError.status, 500);

    const extracted = extractGroqError(errorMessage);

    console.error('❌ [STT Error]:', {
      rawMessage: errorMessage,
      extractedMessage: extracted.message,
      extractedType: extracted.type,
      status: groqError.status,
      code: groqError.code,
      name: groqError.name,
      stack: groqError.stack,
    });

    return jsonResponse(
      {
        error: extracted.message,
        type: extracted.type,
        status: groqError.status ?? null,
      },
      status
    );
  }
}
