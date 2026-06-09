import Groq, { toFile } from "groq-sdk";

export const dynamic = 'force-dynamic';

interface GroqError {
  status?: number;
  message?: string;
  code?: string;
  name?: string;
  stack?: string;
}

/**
 * Build a JSON Response with the correct Content-Type.
 * Centralized so EVERY response (success + error) is guaranteed to be
 * application/json — prevents client-side .json() parsing from failing
 * when proxies or the framework intercept the body.
 */
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

/**
 * Coerce an arbitrary error-status value into a safe HTTP status code.
 * Restricts to the 400–599 range so we never return an invalid status to
 * the client (e.g. status: 0 from a network failure, where ?? 500 would
 * not fall back because 0 is not nullish).
 */
function safeStatus(raw: unknown, fallback = 500): number {
  return typeof raw === 'number' && raw >= 400 && raw < 600 ? raw : fallback;
}

/**
 * Groq SDK error messages often wrap the real error as a stringified JSON
 * inside `error.message`, e.g.:
 *   '400 {"error":{"message":"could not process file - is it a valid media file?","type":"invalid_request_error"}}'
 *
 * This helper unwraps the nested JSON and returns a flat
 * `{ message, type }` pair so the client receives a clean, readable
 * error structure instead of an opaque doubly-nested blob.
 */
function extractGroqError(rawMessage: string): { message: string; type: string | null } {
  // Detect the "<status> {...}" pattern that the Groq SDK uses to embed JSON.
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
  // ── Pre-flight: API key must be present ────────────────────────────────
  // Fail-fast prevents useless downstream Groq calls if the env context shifts.
  if (!process.env.GROQ_API_KEY) {
    console.error('[STT] ❌ GROQ_API_KEY is not configured');
    return jsonResponse(
      { error: 'STT service is not configured: missing GROQ_API_KEY' },
      500
    );
  }

  // ── Guard: multipart parsing can throw on corrupted payloads ──────────
  // A socket teardown mid-upload or malformed boundary headers will cause
  // req.formData() to throw an unhandled exception. Catch it and return
  // a clean 400 Bad Request so the client pipeline stays predictable.
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch (parseErr: unknown) {
    const message = parseErr instanceof Error ? parseErr.message : 'Failed to parse multipart payload';
    console.error('[STT] ❌ Multipart parse error:', message);
    return jsonResponse({ error: `Malformed audio upload: ${message}` }, 400);
  }

  const file = formData.get("file") as File;

  // ── Diagnostic: log what arrives before touching the SDK ─────────────
  // The client now transcodes MediaRecorder's webm/opus to a canonical
  // 16kHz mono WAV before sending, so the expected file.type is 'audio/wav'.
  // If we ever see a different type here, it indicates a regression in the
  // client's transcode-to-wav pipeline.
  console.log('[STT] Received file:', {
    name: file?.name,
    type: file?.type,
    size: file?.size,
  });

  if (!file) {
    // ── HTTP 400: Malformed Structure ────────────────────────────────
    // The request was syntactically invalid — the FormData payload did not
    // include a `file` field at all. This is a client-side bug or a corrupted
    // multipart boundary, not a user behavior issue.
    console.error('[STT] ❌ No file received in form payload');
    return jsonResponse({ error: 'No audio file received' }, 400);
  }

  /**
   * Production Excellence Guardrail: Micro-Recording Protection
   * Audio files under ~12KB lack enough audio frame packets for Groq's
   * Whisper decoder to produce reliable output. They typically result from
   * accidental mic double-clicks or a user letting go of the push-to-talk
   * button before the MediaRecorder has captured a usable chunk.
   *
   * Intercepting these BEFORE the Groq API call avoids:
   *   1. Wasting billable tokens on undecodable audio
   *   2. Returning garbled "thank you" / "bye" / "" transcripts to the UI
   *   3. Cascading downstream errors in extract-client-info and
   *      process-command when a near-empty transcript is fed to the LLM
   *
   * HTTP 422 Unprocessable Content is the correct status: the request was
   * syntactically valid (we got a file with a real size) but semantically
   * unprocessable by the downstream STT engine.
   */
  if (file.size < 12000) {
    // console.warn (yellow) — not console.error — because this is expected
    // user behavior, not a system fault. Keeps log aggregators clean.
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

  try {
    // The Groq Node SDK does not accept a Web API File directly — it requires
    // an Uploadable produced by toFile(). Convert via ArrayBuffer to preserve
    // the binary container exactly as assembled by MediaRecorder.
    const arrayBuffer = await file.arrayBuffer();

    console.log('[STT] ArrayBuffer size:', arrayBuffer.byteLength);

    const uploadable = await toFile(
      new Blob([arrayBuffer], { type: file.type }),
      file.name,
      { type: file.type }
    );

    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

    // STT Vocabulary Boosting: Domain-specific brand anchors + phonetic-deflection
    // hints. Groq's Whisper API exposes the `prompt` field as its sole biasing
    // surface (no `language` or `keywords` parameter is supported), so the
    // canonical brand spellings and explicit mishearing→brand mapping lines
    // are embedded directly into the prompt. This shifts Whisper's next-token
    // attention weights toward our real brand ecosystem and away from generic
    // en-US dictionary defaults that warp "Xneelio" → "Xnelia" and
    // "Zeeder" → "Zeta"/"Cedar"/"Zita".
    //
    // The prompt stays well under Groq's 224-token ceiling to avoid silent
    // truncation that would invalidate the bias.
    const vocabularyBoost = [
      "OVG",
      "Last Chapter Media",
      "BellaCorp",
      "WhiteChapter",
      "Xneelio",
      "Xneelo",
      "Zeeder",
      // Phonetic-deflection lines — Whisper uses these as in-context priors
      // for the acoustic-to-text decoder, so an "Xnelia" acoustic match
      // gets re-anchored to "Xneelio" at decode time.
      "Xnelia is a misspelling of the brand Xneelio.",
      "Zeta, Cedar, or Zita in a client-name context refers to the brand Zeeder.",
      "OVG platform: tenants, clients, resellers, dashboard, branding studio."
    ].join(", ");

    const transcription = await groq.audio.transcriptions.create({
      file: uploadable,
      // whisper-large-v3-turbo has improved WebM/Opus container handling
      model: "whisper-large-v3-turbo",
      response_format: "json",
      temperature: 0,
      prompt: vocabularyBoost,
    });

    // Streaming SST: Return response immediately for UI hydration
    return jsonResponse(
      { text: transcription.text },
      200,
      { 'X-Streaming-Response': 'true' }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const groqError = error as GroqError;
    const status = safeStatus(groqError.status, 500);

    // Unwrap Groq's doubly-nested error: SDK wraps the real error as a
    // stringified JSON inside `error.message`. Surface the flat message
    // and type to the client so the UI can show actionable feedback.
    const extracted = extractGroqError(errorMessage);

    // ── Diagnostic: log the FULL error object (not just message) ────────
    // Per .clinerules: Production Excellence — full server-side telemetry
    // is required to debug STT pipeline failures.
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
