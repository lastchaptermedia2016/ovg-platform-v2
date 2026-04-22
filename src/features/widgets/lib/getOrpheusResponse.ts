import { groq } from "@/lib/ai/config";
import { getTenantConfig } from "@/features/tenants/lib/get-tenant-config";

export interface OrpheusResponse {
  text: string;
  audioBase64?: string;
}

interface GroqCompletionWithAudio {
  choices: Array<{
    message: {
      content: string | null;
    };
  }>;
  audio_output?: string;
}

export async function getOrpheusResponse(
  message: string,
  tenantSlug: string,
): Promise<OrpheusResponse> {
  const config = await getTenantConfig(tenantSlug);

  if (!config) {
    throw new Error("Tenant configuration not found");
  }

  const systemPrompt = config.systemPrompt || "You are a helpful AI assistant.";

  const completion = (await groq.chat.completions.create({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: message },
    ],
    model: "orpheus-beta-tts",
  })) as GroqCompletionWithAudio;

  return {
    text: completion.choices[0].message.content || "",
    audioBase64: completion.audio_output,
  };
}
