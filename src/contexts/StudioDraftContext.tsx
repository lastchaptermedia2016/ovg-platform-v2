'use client';

import { createContext, useContext, ReactNode, useState, useCallback, useEffect } from 'react';
import { createClient as createSupabaseClient } from '@/lib/supabase/client';
import { resolveTenantId } from '@/lib/resolveTenantId';
import type { CanonicalBranding, CanonicalAIPersona, LayerConfig, CanonicalBackgroundSection, CanonicalWidgetConfig, SuggestedAction } from '@/lib/schemas/tenant-config.canonical';
import { normalizeHexColor } from '@/lib/colors';
import { gradientValue, parseGradient } from '@/lib/branding/gradient';

export type LayerType = 'none' | 'solid' | 'gradient' | 'image';

export type LayerDraft = {
  type: LayerType;
  /** Hex color (solid), CSS gradient string (gradient), or URL (image). null when type is none. */
  value: string | null;
  opacity: number;
  backdropBlur: boolean;
};

export type StudioDraft = {
  primaryColor: string;
  logoUrl: string;
  brandName: string;
  widgetPosition: string;
  header: LayerDraft;
  footer: LayerDraft;
  widgetBody: LayerDraft;
  personaMode: 'sales' | 'concierge';
  systemPrompt: string;
  temperature: number;
  voiceId: string;
  greeting: string;
  features?: {
    aiInsightBadge?: boolean;
    aiDesignMirror?: boolean;
    customCss?: boolean;
    voiceFeaturesEnabled?: boolean;
    localFallbackAlert?: boolean;
  };
  suggestedActions?: SuggestedAction[];
};

const defaultLayer: LayerDraft = {
  type: 'none',
  value: null,
  opacity: 1,
  backdropBlur: false,
};

/**
 * Factory-default StudioDraft. Used as both the initial useState value and the
 * base for canonicalConfigToDraft when a tenant has no stored widget_config.
 */
const defaultDraft: StudioDraft = {
  primaryColor: '#1A73E8',
  logoUrl: '',
  brandName: 'Omniverge Global',
  widgetPosition: 'bottom-right',
  header: { ...defaultLayer },
  footer: { ...defaultLayer },
  widgetBody: { ...defaultLayer },
  personaMode: 'sales',
  systemPrompt: '',
  temperature: 0.3,
  voiceId: '',
  greeting: '',
  features: {},
  suggestedActions: [],
};

/**
 * Convert a partial CanonicalBranding patch into a StudioDraft patch.
 * Handles layered header/footer/widgetBody as well as legacy flat fields.
 */
export function canonicalBrandingToDraftPatch(patch: Partial<CanonicalBranding>): Partial<StudioDraft> {
  const next: Partial<StudioDraft> = {};

  if (patch.primaryColor) next.primaryColor = normalizeHexColor(patch.primaryColor);
  if (patch.logoUrl !== undefined) next.logoUrl = patch.logoUrl ?? '';
  if (patch.brandName !== undefined) next.brandName = patch.brandName;
  if (patch.widgetPosition) next.widgetPosition = patch.widgetPosition;

  const header = patch.header;
  const headerConfig = patch.headerConfig;
  if (header) {
    next.header = {
      type: header.type,
      value: header.type === 'solid' && header.value ? normalizeHexColor(header.value) : header.value,
      opacity: header.opacity ?? 1,
      backdropBlur: header.backdropBlur ?? false,
    };
  } else if (headerConfig?.type && headerConfig.type !== 'none') {
    let value: string | null = null;
    if (headerConfig.type === 'solid') {
      value = headerConfig.colorStart ? normalizeHexColor(headerConfig.colorStart) : null;
    } else if (headerConfig.type === 'gradient') {
      value = gradientValue(
        normalizeHexColor(headerConfig.colorStart ?? '#1A73E8'),
        normalizeHexColor(headerConfig.colorEnd ?? '#0A2540')
      );
    } else if (headerConfig.type === 'image') {
      value = headerConfig.image ?? null;
    }
    next.header = {
      type: headerConfig.type,
      value,
      opacity: headerConfig.opacity ?? 1,
      backdropBlur: false,
    };
  }

  const footer = patch.footer;
  const footerConfig = patch.footerConfig;
  if (footer) {
    next.footer = {
      type: footer.type,
      value: footer.type === 'solid' && footer.value ? normalizeHexColor(footer.value) : footer.value,
      opacity: footer.opacity ?? 1,
      backdropBlur: footer.backdropBlur ?? false,
    };
  } else if (footerConfig?.type && footerConfig.type !== 'none') {
    let value: string | null = null;
    if (footerConfig.type === 'solid') {
      value = footerConfig.colorStart ? normalizeHexColor(footerConfig.colorStart) : null;
    } else if (footerConfig.type === 'gradient') {
      value = gradientValue(
        normalizeHexColor(footerConfig.colorStart ?? '#1A73E8'),
        normalizeHexColor(footerConfig.colorEnd ?? '#0A2540')
      );
    } else if (footerConfig.type === 'image') {
      value = footerConfig.image ?? null;
    }
    next.footer = {
      type: footerConfig.type,
      value,
      opacity: footerConfig.opacity ?? 1,
      backdropBlur: false,
    };
  }

  const widgetBody = patch.widgetBody;
  if (widgetBody) {
    next.widgetBody = {
      type: widgetBody.type,
      value: widgetBody.type === 'solid' && widgetBody.value ? normalizeHexColor(widgetBody.value) : widgetBody.value,
      opacity: widgetBody.opacity ?? 1,
      backdropBlur: widgetBody.backdropBlur ?? false,
    };
  } else if (patch.widgetBodyOpacity !== undefined || patch.widgetBodyBackground) {
    next.widgetBody = {
      type: 'solid',
      value: patch.widgetBodyBackground ? normalizeHexColor(patch.widgetBodyBackground) : null,
      opacity: patch.widgetBodyOpacity ?? 1,
      backdropBlur: false,
    };
  }

  return next;
}

/**
 * Map a UI LayerDraft into the canonical LayerConfig shape. Always emitted (even
 * for type 'none') so a later clear overwrites a previously-stored layer via the
 * deep-merge in dispatchUpdateStudioConfig.
 */
function layerToCanonical(layer: LayerDraft): LayerConfig {
  return {
    type: layer.type,
    value: layer.value,
    opacity: layer.opacity,
    backdropBlur: layer.backdropBlur,
  };
}

/**
 * Map a LayerDraft into the legacy CanonicalBackgroundSection shape so existing
 * headerConfig/footerConfig consumers (voice pipeline, agentic colleague) keep
 * working alongside the new layered model.
 */
function layerToLegacySection(layer: LayerDraft): CanonicalBackgroundSection {
  switch (layer.type) {
    case 'none':
      return { type: 'none' };
    case 'solid':
      return { type: 'solid', colorStart: layer.value ? layer.value : undefined };
    case 'gradient': {
      const [start, end] = parseGradient(layer.value);
      return { type: 'gradient', colorStart: start, colorEnd: end };
    }
    case 'image':
      return { type: 'image', image: layer.value ? layer.value : null };
  }
}

export function toCanonicalBranding(draft: StudioDraft): Partial<CanonicalBranding> {
  const header = layerToLegacySection(draft.header);
  const footer = layerToLegacySection(draft.footer);
  return {
    primaryColor: draft.primaryColor,
    logoUrl: draft.logoUrl?.trim() ? draft.logoUrl.trim() : null,
    brandName: draft.brandName?.trim() ? draft.brandName.trim() : undefined,
    widgetPosition: draft.widgetPosition as CanonicalBranding['widgetPosition'],
    header: layerToCanonical(draft.header),
    footer: layerToCanonical(draft.footer),
    widgetBody: layerToCanonical(draft.widgetBody),
    headerConfig: header,
    footerConfig: footer,
    widgetBodyOpacity: draft.widgetBody.type === 'none' ? null : draft.widgetBody.opacity,
    widgetBodyBackground: draft.widgetBody.type === 'none' ? null : draft.widgetBody.value ?? null,
  };
}

export function toCanonicalAIPersona(draft: StudioDraft): Partial<CanonicalAIPersona> {
  return {
    name: draft.personaMode === 'sales' ? 'Sales Assistant' : 'Concierge Assistant',
    personaMode: draft.personaMode,
    systemPrompt: draft.systemPrompt,
    temperature: draft.temperature,
    voiceId: draft.voiceId,
  };
}

interface StudioDraftContextType {
  draft: StudioDraft;
  setDraft: React.Dispatch<React.SetStateAction<StudioDraft>>;
  /**
   * Atomic, voice-friendly bridge for persona changes. The legacy voice path
   * (useZeederVoice) routes an UPDATE_PERSONA intent through this single
   * surface so the StudioDraftProvider remains the sole source of truth — no
   * detached event listeners or duplicate state trees.
   */
  dispatchStudioAction: (action: { type: 'UPDATE_PERSONA'; mode: 'sales' | 'concierge' }) => void;
  /** Apply a branding theme patch to the draft without persisting to the database. */
  applyBrandingTheme: (patch: Partial<CanonicalBranding>) => void;
  /** Request the BrandingStudio to persist the current draft. */
  requestBrandingSave: () => void;
}

const StudioDraftContext = createContext<StudioDraftContextType | undefined>(undefined);

export function useStudioDraft() {
  const context = useContext(StudioDraftContext);
  if (context === undefined) {
    throw new Error('useStudioDraft must be used within a StudioDraftProvider');
  }
  return context;
}

/**
 * Imperative bridge consumed by the voice layer. Maps a persona-mode action
 * onto the canonical StudioDraft, mirroring exactly what the Persona page's
 * own toggle does — including resetting the system prompt to the default
 * template for the chosen mode.
 */
const DEFAULT_SYSTEM_PROMPTS: Record<'sales' | 'concierge', string> = {
  sales:
    "You are a sales-focused AI assistant. Your primary goal is to qualify leads, understand customer needs, and guide them toward a purchase decision. Be persuasive yet professional. Ask discovery questions to identify pain points, present relevant solutions, and create urgency when appropriate. Always maintain a helpful tone while driving toward conversion.",
  concierge:
    "You are a concierge-style AI assistant. Your primary goal is to provide exceptional hospitality and personalized service. Anticipate needs, offer thoughtful recommendations, and ensure every interaction feels premium and caring. Prioritize customer comfort and satisfaction. Be attentive to details and proactive in offering assistance.",
};

/**
 * Build a full StudioDraft from a tenant's stored widget_config so the studio
 * (and the live WidgetPreview) reflects persisted branding + persona on mount,
 * instead of factory defaults. Reuses canonicalBrandingToDraftPatch for the
 * layered branding fields.
 */
function canonicalConfigToDraft(
  config: Partial<CanonicalWidgetConfig> | null | undefined
): StudioDraft {
  if (!config) return defaultDraft;
  const brandingPatch = canonicalBrandingToDraftPatch(config.branding ?? {});
  const persona = config.aiPersona ?? (config.ai_settings as unknown as CanonicalAIPersona | undefined);
  const personaMode: 'sales' | 'concierge' =
    persona?.personaMode === 'concierge' ? 'concierge' : 'sales';
  return {
    ...defaultDraft,
    ...brandingPatch,
    personaMode,
    systemPrompt: persona?.systemPrompt ?? DEFAULT_SYSTEM_PROMPTS[personaMode],
    temperature: persona?.temperature ?? 0.3,
    voiceId: persona?.voiceId ?? '',
    greeting: (config.greeting as string | undefined) ?? '',
    features: config.features as StudioDraft['features'],
    suggestedActions: (config.suggestedActions as SuggestedAction[] | undefined) ?? [],
  };
}

export function StudioDraftProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<StudioDraft>(defaultDraft);

  const dispatchStudioAction = useCallback(
    (action: { type: 'UPDATE_PERSONA'; mode: 'sales' | 'concierge' }) => {
      if (action.type === 'UPDATE_PERSONA') {
        setDraft((prev) =>
          prev.personaMode === action.mode
            ? prev
            : {
                ...prev,
                personaMode: action.mode,
                systemPrompt: DEFAULT_SYSTEM_PROMPTS[action.mode],
              }
        );
      }
    },
    []
  );

  const applyBrandingTheme = useCallback((patch: Partial<CanonicalBranding>) => {
    const draftPatch = canonicalBrandingToDraftPatch(patch);
    setDraft((prev) => ({ ...prev, ...draftPatch }));
  }, []);

  const requestBrandingSave = useCallback(() => {
    window.dispatchEvent(new CustomEvent('branding-concierge:confirm'));
  }, []);

  useEffect(() => {
    const handler = (event: Event) => {
      const custom = event as CustomEvent<{ branding: Partial<CanonicalBranding> }>;
      if (custom.type === 'branding-concierge:apply') {
        applyBrandingTheme(custom.detail?.branding ?? {});
      }
    };
    window.addEventListener('branding-concierge:apply', handler);
    return () => window.removeEventListener('branding-concierge:apply', handler);
  }, [applyBrandingTheme]);

  useEffect(() => {
    let cancelled = false;
    const supabase = createSupabaseClient();
    supabase
      .auth.getSession()
      .then(async ({ data }) => {
        const session = data.session;
        if (!session?.user) return;
        const { data: tenantResult, error: tenantErr } = await resolveTenantId(session.user.id);
        if (tenantErr || !tenantResult) {
          console.warn('[StudioDraft] Hydration skipped — tenant unresolved:', tenantErr?.message);
          return;
        }
        const { data: tenant, error: fetchErr } = await supabase
          .from('tenants')
          .select('widget_config')
          .eq('id', tenantResult)
          .maybeSingle();
        if (fetchErr || !tenant?.widget_config) return;
        if (cancelled) return;
        setDraft(canonicalConfigToDraft(tenant.widget_config as Partial<CanonicalWidgetConfig>));
      })
      .catch((err) => {
        console.warn('[StudioDraft] Hydration failed:', err);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
      <StudioDraftContext.Provider value={{ draft, setDraft, dispatchStudioAction, applyBrandingTheme, requestBrandingSave }}>
      {children}
    </StudioDraftContext.Provider>
  );
}
