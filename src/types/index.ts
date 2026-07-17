import { z } from "zod";

export const TenantSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string(),
  reseller_id: z.string().uuid().nullable().optional(),
  name: z.string(),
  branding_colors: z.object({
    primary: z.string(),
    secondary: z.string(),
  }).nullable().optional(),
  custom_assets: z.object({
    header_url: z.string().nullable().optional(),
    footer_url: z.string().nullable().optional(),
  }).optional(),
  show_ovg_branding: z.boolean().default(false),
  pricing_tier_key: z.string().optional(),
  voice_id: z.string().nullable(),
  system_prompt: z.string().nullable(),
  is_active: z.boolean().default(true),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
  // Extended fields for ClientsGrid compatibility
  email: z.string().nullable().optional(),
  category: z.string().optional(),
  industry: z.string().optional(),
  category_config: z.record(z.unknown()).optional(),
  signal_count: z.number().optional(),
  signal_trend: z.array(z.number()).optional(),
  ai_insight: z.string().nullable().optional(),
  last_seen: z.string().nullable().optional(),
  total_revenue: z.number().nullable().optional(),
  total_leads: z.number().nullable().optional(),
  mrr: z.number().nullable().optional(),
  permission_level: z.enum(['standard', 'readonly']).optional(),
  indicators: z.object({
    ai: z.enum(['active', 'inactive', 'error']),
    sms: z.enum(['active', 'inactive', 'error']),
    vin: z.enum(['active', 'inactive', 'error']),
    signal: z.enum(['active', 'inactive', 'error']),
  }).optional(),
});

export type Tenant = z.infer<typeof TenantSchema>;

export type IndicatorStatus = 'active' | 'inactive' | 'error';

export interface Indicators {
  ai: IndicatorStatus;
  sms: IndicatorStatus;
  vin: IndicatorStatus;
  signal: IndicatorStatus;
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

export interface BrandingBag {
  primaryColor: string;
  accentColor: string;
  logoUrl: string | null;
  favicon: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  websiteUrl?: string | null;
  typography?: {
    headingFont: string;
    bodyFont: string;
  };
  borderRadius?: number;
  mode?: 'light' | 'dark';
}

export interface BrandingData {
  name: string;
  logoUrl: string;
  primaryColor: string;
  accentColor: string;
  favicon?: string;
  metaTitle?: string;
  metaDescription?: string;
  typography?: {
    headingFont: string;
    bodyFont: string;
  };
  borderRadius?: number;
  mode?: 'light' | 'dark';
}

/** Response shape from the GET /api/reseller/[slug]/branding endpoint */
export interface BrandingFetchResponse {
  name: string;
  tenant_id: string;
  brandingBag: BrandingBag;
  version: number;
}

export interface Client {
  id: string;
  slug: string;
  name: string;
  email: string;
  reseller_id?: string;
  reseller_slug?: string;
  branding?: BrandingData;
  ui_settings?: Record<string, unknown>;
  ai_settings?: Record<string, unknown>;
}

export interface Reseller {
  id: string;
  slug: string;
  name: string;
  email: string;
  branding_colors: {
    primary: string;
    secondary: string;
  } | null;
  branding_assets: {
    header_url: string | null;
    footer_url: string | null;
  };
  pricing_tiers: Record<string, unknown>;
  branding?: BrandingData;
  paystack_account_id?: string;
  is_active: boolean;
}

// URL Resolution Types
export type EntityType = 'reseller' | 'client' | 'master' | null;

export interface RouteContext {
  entityType: EntityType;
  slug: string | null;
  branding: BrandingData | null;
  parentReseller?: Reseller | null;
}

// Branding Context State
export interface BrandingContextState {
  branding: BrandingData;
  entityType: EntityType;
  slug: string | null;
  isLoading: boolean;
  error: string | null;
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

export interface Vehicle {
  id: string;
  tenant_id: string;
  vin: string;
  registration?: string;
  make_model?: string;
  year?: number;
  natis_payload: Record<string, unknown>;
  created_at: string;
}