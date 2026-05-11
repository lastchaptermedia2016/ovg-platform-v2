import Groq from "groq-sdk";

export const dynamic = 'force-dynamic'; // Prevents build-time API key errors

if (typeof window !== 'undefined') {
  console.log("OVG-PLATFORM-V2: Voice identity updated to Hannah.");
}

export async function POST(req: Request) {
  try {
    const { text, voice, metadata } = await req.json();
    const apiKey = process.env.GROQ_API_KEY;

    // Log metadata for clean tracking
    console.log('[TTS] Request:', { 
      textLength: text?.length, 
      voice, 
      resellerSlug: metadata?.resellerSlug 
    });

    if (!apiKey) {
      return new Response(JSON.stringify({ error: "API Key Missing" }), { status: 500 });
    }

    // Lazy instantiation inside the handler to protect the build
    const groq = new Groq({ apiKey });

    // Your logic, optimized for streaming instead of local file writing
    const wav = await groq.audio.speech.create({
      model: "canopylabs/orpheus-v1-english",
      voice: voice || "hannah", // Using 'hannah' as requested
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
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("❌ [API] Speech generation failed:", errorMessage);
    return new Response(JSON.stringify({ error: errorMessage }), { status: 500 });
  }
}
