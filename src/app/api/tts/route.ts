import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const { text, voice = "daniel" } = await request.json();

    if (!text) {
      return NextResponse.json({ error: "Text is required" }, { status: 400 });
    }

    const response = await fetch("https://api.groq.com/openai/v1/audio/speech", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "canopylabs/orpheus-v1-english",
        input: text,
        voice: voice || "daniel",
        response_format: "wav",
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("[TTS] Groq error:", error);
      return NextResponse.json({ error: "TTS failed" }, { status: 500 });
    }

    const audioBuffer = await response.arrayBuffer();

    return new NextResponse(audioBuffer, {
      headers: {
        "Content-Type": "audio/wav",
        "Content-Length": audioBuffer.byteLength.toString(),
      },
    });
  } catch (error) {
    console.error("[TTS] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
