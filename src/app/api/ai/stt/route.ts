import Groq, { toFile } from "groq-sdk";

export const dynamic = 'force-dynamic';

interface GroqError {
  status?: number;
  message?: string;
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;

    // ── Diagnostic: log what arrives before touching the SDK ─────────────
    console.log('[STT] Received file:', {
      name: file?.name,
      type: file?.type,
      size: file?.size,
    });

    if (!file || file.size === 0) {
      console.error('[STT] ❌ No file or empty file received');
      return new Response(JSON.stringify({ error: 'No audio file received' }), { status: 400 });
    }

    // The Groq Node SDK does not accept a Web API File directly — it requires
    // an Uploadable produced by toFile(). Convert via ArrayBuffer to preserve
    // the binary container exactly as assembled by MediaRecorder.
    const arrayBuffer = await file.arrayBuffer();
    const uploadable = await toFile(
      new Blob([arrayBuffer], { type: file.type }),
      file.name,
      { type: file.type }
    );

    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

    // SST Vocabulary Boosting: Common brand names and phrases to improve transcription accuracy
    const vocabularyBoost = [
      "BellaCorp",
      "WhiteChapter",
      "OVG",
      "Last Chapter Media",
      "Acme Corp",
      "TechStart",
      "InnovateLab"
    ].join(", ");

    const transcription = await groq.audio.transcriptions.create({
      file: uploadable,
      model: "whisper-large-v3",
      response_format: "json",
      temperature: 0,
      prompt: vocabularyBoost,
    });

    // Streaming SST: Return response immediately for UI hydration
    return new Response(JSON.stringify({ text: transcription.text }), { 
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'X-Streaming-Response': 'true'
      }
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const groqError = error as GroqError;
    const status = groqError.status ?? 500;
    console.error("❌ [STT Error]:", errorMessage);
    return new Response(JSON.stringify({ error: errorMessage }), { status });
  }
}
