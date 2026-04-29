import Groq from "groq-sdk";

export const dynamic = 'force-dynamic'; // Prevents build-time API key errors

export async function POST(req: Request) {
  try {
    const { text, voice } = await req.json();
    const apiKey = process.env.GROQ_API_KEY;

    if (!apiKey) {
      return new Response(JSON.stringify({ error: "API Key Missing" }), { status: 500 });
    }

    // Lazy instantiation inside the handler to protect the build
    const groq = new Groq({ apiKey });

    // Your logic, optimized for streaming instead of local file writing
    const wav = await groq.audio.speech.create({
      model: "canopylabs/orpheus-v1-english",
      voice: voice || "autumn", // Using 'autumn' as requested
      response_format: "wav",
      input: text,
    });

    const buffer = Buffer.from(await wav.arrayBuffer());

    // Return the buffer directly to the browser
    return new Response(buffer, {
      headers: {
        "Content-Type": "audio/wav",
        "Content-Length": buffer.length.toString(),
      },
    });
  } catch (error: any) {
    console.error("❌ [API] Speech generation failed:", error.message);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}
