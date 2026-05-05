import Groq from "groq-sdk";

export const dynamic = 'force-dynamic';

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
      model: "whisper-large-v3", // 🚀 REMOVE "-turbo" TO CLEAR THE 403
      response_format: "json",
      temperature: 0,
      prompt: vocabularyBoost, // Vocabulary Boosting: Forces AI to favor specific strings
    });

    // Streaming SST: Return response immediately for UI hydration
    return new Response(JSON.stringify({ text: transcription.text }), { 
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'X-Streaming-Response': 'true'
      }
    });
  } catch (error: any) {
    console.error("❌ [STT Error]:", error.message);
    return new Response(JSON.stringify({ error: error.message }), { status: error.status || 500 });
  }
}
