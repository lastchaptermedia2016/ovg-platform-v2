import { groq } from "./client";

export interface UnifiedStreamOptions {
  voice?: string;
  speed?: number;
  model?: string;
}

export async function* unifiedStream(
  message: string,
  options: UnifiedStreamOptions = {},
): AsyncGenerator<
  | { type: "text"; content: string }
  | { type: "audio"; audioBase64: string; format: "wav" }
> {
  const {
    voice = "hannah",
    speed = 1.0,
    model = "llama-3.3-70b-versatile",
  } = options;

  try {
    // Stream text from Groq LLM
    const completion = await groq.chat.completions.create({
      model,
      messages: [{ role: "user", content: message }],
      temperature: 0.7,
      max_tokens: 900,
      stream: true,
    });

    let fullText = "";

    for await (const chunk of completion) {
      const content = chunk.choices[0]?.delta?.content || "";
      if (content) {
        fullText += content;
        yield { type: "text", content };
      }
    }

    // Generate audio using CanopyLabs Orpheus
    if (fullText.trim().length > 0) {
      try {
        const audioResponse = await groq.audio.speech.create({
          model: "canopylabs/orpheus-v1-english",
          voice,
          input: fullText,
          response_format: "wav",
          speed,
        });

        const audioBuffer = Buffer.from(await audioResponse.arrayBuffer());
        const audioBase64 = audioBuffer.toString("base64");
        yield { type: "audio", audioBase64, format: "wav" };
      } catch (ttsError) {
        console.error("TTS failed:", ttsError);
      }
    }
  } catch (error) {
    console.error("Unified stream error:", error);
    throw error;
  }
}
