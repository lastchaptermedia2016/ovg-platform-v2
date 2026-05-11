import Groq from "groq-sdk";

export const dynamic = 'force-dynamic';

interface GroqError {
  status?: number;
  message?: string;
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;

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
      file: file,
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
