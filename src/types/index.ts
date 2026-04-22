export interface Tenant {
  id: string;
  tenant_id: string;
  name: string;
  system_prompt: string | null;
  preferred_voice: string;
  created_at?: string;
  updated_at?: string;
  branding?: {
    primaryColor?: string;
    logoUrl?: string;
    accentColor?: string;
    aiName?: string;
  };
}

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
