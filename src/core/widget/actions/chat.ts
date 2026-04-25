"use server";

import { groq } from "@/lib/ai/config";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getTenantId } from "@/core/tenant/tenant";

type StreamChunk =
  | { type: "text"; content: string }
  | { type: "audio"; audioBase64: string; format: "wav" }
  | { type: "error"; message: string };

export async function* processUserMessage(
  userMessage: string,
  tenantId: string,
): AsyncGenerator<StreamChunk> {
  try {
    // === Zero-Leak Identity First ===
    const resolvedTenantId = getTenantId(tenantId);
    if (!resolvedTenantId) {
      yield { type: "error", message: "Tenant ID is required" };
      return;
    }

    // Fetch tenant-specific config using admin client
    const { data: tenant, error } = await supabaseAdmin
      .from("tenants")
      .select("id, tenant_id, name, system_prompt, voice_id")
      .eq("tenant_id", resolvedTenantId)
      .single();

    if (error || !tenant) {
      yield { type: "error", message: `Unknown tenant: ${resolvedTenantId}` };
      return;
    }

    const systemPrompt =
      tenant.system_prompt || "You are a helpful and friendly assistant.";

    // === Step 1: Stream text from Groq LLM ===
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile", // Change model as needed
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: 0.7,
      max_tokens: 900,
      stream: true,
    });

    // === Step 1: Stream text from Groq LLM and collect full text ===
    let fullText = "";
    for await (const chunk of completion) {
      const content = chunk.choices[0]?.delta?.content || "";
      if (content) {
        fullText += content;
        yield { type: "text", content } as const;
      }
    }

    // === Step 2: Generate Orpheus TTS Audio (CanopyLabs) ===
    if (fullText.trim().length > 0) {
      try {
        const audioResponse = await groq.audio.speech.create({
          model: "canopylabs/orpheus-v1-english",
          voice: tenant.voice_id || "hannah",
          input: fullText,
          response_format: "wav",
        });

        const audioBuffer = Buffer.from(await audioResponse.arrayBuffer());
        const audioBase64 = audioBuffer.toString("base64");
        yield { type: "audio", audioBase64, format: "wav" } as const;
      } catch {
        // We still delivered the text — audio is optional
      }
    }
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Internal error occurred";
    yield { type: "error", message };
  }
}
