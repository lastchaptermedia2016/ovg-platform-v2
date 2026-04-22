import { z } from "zod";

export const TenantSchema = z.object({
  id: z.string(),
  tenant_id: z.string(),
  name: z.string(),
  system_prompt: z.string().nullable(),
  preferred_voice: z.string(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
  branding: z
    .object({
      primaryColor: z.string().optional(),
      logoUrl: z.string().optional(),
      accentColor: z.string().optional(),
      aiName: z.string().optional(),
    })
    .optional(),
});

export type Tenant = z.infer<typeof TenantSchema>;

export interface TenantConfig {
  id: string;
  tenant_id: string;
  system_prompt?: string;
  preferred_voice?: string;
  branding?: {
    aiName?: string;
    voiceId?: string;
    canopyEndpoint?: string;
  };
}

export interface Client {
  id: string;
  name: string;
  email: string;
  reseller_id?: string;
  ui_settings?: Record<string, unknown>;
  ai_settings?: Record<string, unknown>;
}

export interface Reseller {
  id: string;
  name: string;
  email: string;
  stripe_account_id?: string;
}

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface OrpheusResponse {
  text: string;
  audioBase64?: string;
  error?: string;
}

export interface ChatResponse {
  text: string;
  audioBase64?: string;
}

export interface Message {
  role: "user" | "assistant";
  content: string;
}

export interface ChatState {
  status: "idle" | "thinking" | "speaking" | "error";
  messages: Message[];
}

export interface OrpheusPayload {
  text: string;
  voiceId?: string;
  canopyEndpoint?: string;
  elevenLabsApiKey?: string;
}
