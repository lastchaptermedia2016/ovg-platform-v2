import { NextRequest } from "next/server";
import { processUserMessage } from "@/lib/actions/chat";

export async function POST(request: NextRequest) {
  try {
    const { message, tenantId } = await request.json();

    if (!message) {
      return new Response(JSON.stringify({ error: "Message is required" }), {
        status: 400,
      });
    }

    let fullText = "";
    let audioBase64 = "";
    let voiceUsed = "hannah";

    for await (const chunk of processUserMessage(message, tenantId)) {
      if (chunk.type === "text") {
        fullText += chunk.content;
      }
      if (chunk.type === "audio") {
        audioBase64 = chunk.audioBase64;
      }
      if (chunk.type === "error") {
        return new Response(
          JSON.stringify({ success: false, message: chunk.message }),
          { status: 500 }
        );
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        text: fullText,
        response: fullText,
        audioBase64: audioBase64,
        voiceUsed: voiceUsed,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch {
    return new Response(
      JSON.stringify({ success: false, message: "Failed to process request" }),
      { status: 500 }
    );
  }
}
