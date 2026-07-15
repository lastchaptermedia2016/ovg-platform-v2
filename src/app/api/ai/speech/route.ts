import Groq from "groq-sdk";

export const dynamic = "force-dynamic"; // Prevents build-time API key errors

const DEFAULT_VOICE = "hannah";
const TTS_MODEL = "canopylabs/orpheus-v1-english";

interface SpeechInput {
  text?: string;
  voice?: string;
  model?: string;
  resellerSlug?: string;
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

  const voice = input.voice || DEFAULT_VOICE;
  const apiKey = process.env.GROQ_API_KEY;

  // Bridge dual frontend patterns: top-level resellerSlug (ClientBrandingStudio)
  // takes precedence; fall back to nested metadata (UniversalCommandModal) for
  // backward compatibility.
  const _activeResellerSlug = input.resellerSlug ?? input.metadata?.resellerSlug;

  if (!apiKey) {
    return new Response(JSON.stringify({ error: "API Key Missing" }), {
      status: 500,
    });
  }

  try {
    // Lazy instantiation inside the handler to protect the build
    const groq = new Groq({ apiKey });

    const wav = await groq.audio.speech.create({
      model: input.model || TTS_MODEL,
      voice,
      response_format: "wav",
      input: text,
    });

    const buffer = Buffer.from(await wav.arrayBuffer());

    // Return the buffer directly to the browser
    return new Response(buffer, {
      headers: {
        "Content-Type": "audio/wav",
        "Content-Length": buffer.length.toString(),
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("❌ [API] Speech generation failed:", errorMessage);
    return new Response(JSON.stringify({ error: errorMessage }), { status: 500 });
  }
}

export async function POST(req: Request) {
  let input: SpeechInput = {};
  try {
    input = (await req.json()) as SpeechInput;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
    });
  }
  return generateSpeech(input);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const input: SpeechInput = {
    text: url.searchParams.get("text") ?? undefined,
    voice: url.searchParams.get("voice") ?? undefined,
    model: url.searchParams.get("model") ?? undefined,
    resellerSlug: url.searchParams.get("resellerSlug") ?? undefined,
  };
  return generateSpeech(input);
}
