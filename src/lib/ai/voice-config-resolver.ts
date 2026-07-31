import { supabaseAdmin } from '@/lib/supabase/admin';

export interface VoiceConfig {
  apiKey: string;
  voiceId: string;
  provider: string;
}

const DEFAULT_VOICE = 'hannah';
const DEFAULT_PROVIDER = 'groq';

export async function resolveVoiceConfig(input: {
  tenantId?: string;
  resellerSlug?: string;
}): Promise<VoiceConfig> {
  let apiKey = '';
  let voiceId = DEFAULT_VOICE;
  let provider = DEFAULT_PROVIDER;

  if (input.resellerSlug) {
    const { data: reseller } = await supabaseAdmin
      .from('resellers')
      .select('tenant_id')
      .eq('slug', input.resellerSlug)
      .maybeSingle();

    const resolvedTenantId = reseller?.tenant_id || input.tenantId;

    if (resolvedTenantId) {
      const { data: tenant } = await supabaseAdmin
        .from('tenants')
        .select('widget_config')
        .eq('id', resolvedTenantId)
        .maybeSingle();

      const widgetConfig = (tenant?.widget_config || {}) as Record<string, unknown>;
      const aiPersona = widgetConfig.aiPersona as Record<string, unknown> | undefined;
      const aiSettings = widgetConfig.ai_settings as Record<string, unknown> | undefined;

      voiceId =
        (aiPersona?.voiceId as string | undefined) ||
        (aiSettings?.voiceId as string | undefined) ||
        DEFAULT_VOICE;

      if (aiPersona?.provider) {
        provider = aiPersona.provider as string;
      } else if (aiSettings?.provider) {
        provider = aiSettings.provider as string;
      }
    }
  } else if (input.tenantId) {
    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('widget_config')
      .eq('id', input.tenantId)
      .maybeSingle();

    const widgetConfig = (tenant?.widget_config || {}) as Record<string, unknown>;
    const aiPersona = widgetConfig.aiPersona as Record<string, unknown> | undefined;
    const aiSettings = widgetConfig.ai_settings as Record<string, unknown> | undefined;

    voiceId =
      (aiPersona?.voiceId as string | undefined) ||
      (aiSettings?.voiceId as string | undefined) ||
      DEFAULT_VOICE;

    if (aiPersona?.provider) {
      provider = aiPersona.provider as string;
    } else if (aiSettings?.provider) {
      provider = aiSettings.provider as string;
    }
  }

  apiKey = process.env.GROQ_API_KEY || '';

  if (!apiKey) {
    console.error('[VoiceConfig] GROQ_API_KEY is not configured');
  }

  return { apiKey, voiceId, provider };
}
