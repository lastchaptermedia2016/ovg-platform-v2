'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';

function triggerHapticFeedback(): void {
  if (typeof navigator !== "undefined" && navigator.vibrate) {
    navigator.vibrate(30);
  }
}
import { useBrandingStudio } from '@/hooks/use-branding-studio';
import { useVoiceCommand } from '@/hooks/use-voice-command';
import { Client as ClientType } from '@/types/index';
import { createHarmoniousGreeting, VisualStyle } from '@/lib/voice-visual-harmony';
import { isInvalidSlug } from '@/lib/utils/guard';
import { type IncomingAIAction } from '@/hooks/use-voice-command';
import { useHannah } from '@/contexts/HannahContext';
import type { SuggestedAction, CanonicalBranding } from '@/lib/schemas/tenant-config.canonical';
import { SuggestedActionsEditor } from '@/components/admin/SuggestedActionsEditor';
import ChatWidget from '@/components/widget/ChatWidget';
import { gradientValue, parseGradient, isGradient, isImageBackground } from '@/lib/branding/gradient';
import { BackgroundControlsPanel } from '@/components/reseller/BackgroundControlsPanel';

interface ClientWithBranding extends ClientType {
  industry?: string;
  pricing_tier_key?: string;
}

interface InitialConfig {
  branding?: Partial<BrandingConfig>;
  features?: {
    aiInsightBadge?: boolean;
    aiDesignMirror?: boolean;
    customCss?: boolean;
    /** Voice Features Enabled — toggles the mic button in the client widget. */
    voiceFeaturesEnabled?: boolean;
    /** Local Fallback Alert — notify client on browser-native STT fallback. */
    localFallbackAlert?: boolean;
  };
  /** Default TTS voice param sent to /api/ai/speech. */
  defaultTtsVoice?: string;
  /** Dynamic quick-action pills shown above the widget chat input. */
  suggestedActions?: SuggestedAction[];
  /** Pre-configured greeting text loaded from widget_config. */
  greeting?: string;
}

interface ClientBrandingStudioProps {
  clientId: string;
  resellerSlug: string;
  clients: ClientWithBranding[];
  onClientChange: (clientId: string) => void;
  initialConfig?: InitialConfig;
  planTier?: string;
}

export interface BrandingConfig {
  headerBackground: string;
  headerBackgroundType: 'solid' | 'gradient' | 'image';
  headerGradientStart: string;
  headerGradientEnd: string;
  headerImage: string;
  headerOpacity: number;
  footerBackground: string;
  footerBackgroundType: 'solid' | 'gradient' | 'image';
  footerGradientStart: string;
  footerGradientEnd: string;
  footerImage: string;
  footerOpacity: number;
  logoUrl: string;
  aiInsightBadge: boolean;
  aiDesignMirror: boolean;
  customCss: boolean;
  customCssCode: string;
  /** Voice Features Enabled — toggles the mic button in the client chat widget. */
  voiceFeaturesEnabled: boolean;
  /** Local Fallback Alert — notify client when falling back to browser-native STT. */
  localFallbackAlert: boolean;
  /** Default TTS voice param sent to /api/ai/speech (e.g. 'hannah', 'classic_male'). */
  defaultTtsVoice: string;
  /** Chat body (message window) background type */
  widgetBodyBackgroundType: 'solid' | 'gradient' | 'image';
  /** Chat body (message window) background — solid hex color or gradient start color */
  widgetBodyBackground: string;
  /** Chat body gradient start color (only when widgetBodyBackgroundType === 'gradient') */
  widgetBodyGradientStart: string;
  /** Chat body gradient end color (only when widgetBodyBackgroundType === 'gradient') */
  widgetBodyGradientEnd: string;
  /** Chat body image URL (only when widgetBodyBackgroundType === 'image') */
  widgetBodyImage: string;
  /** Chat body (message window) transparency — 0.0 (fully transparent) to 1.0 (opaque) */
  widgetBodyOpacity: number;
  /** Header title / company name shown in the widget header */
  brandName: string;
  /** Widget placement corner — synced from tenant widget_config.branding.widgetPosition */
  widgetPosition: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
}

type StudioAction = IncomingAIAction;

/**
 * Default TTS voice options exposed to the reseller. The `value` maps directly
 * to the `voice` param of the unified `/api/ai/speech` endpoint, so changing
 * the selection retunes the client widget's spoken responses.
 */
export const TTS_VOICE_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'hannah', label: 'Hannah (Default)' },
  { value: 'classic_male', label: 'Classic Male' },
  { value: 'classic_female', label: 'Classic Female' },
  { value: 'british_male', label: 'British Male' },
  { value: 'calm_female', label: 'Calm Female' },
];

const STUDIO_CAPABILITIES = {
  header: {
    description: 'Change the header background color, gradient, image, or opacity.',
    examples: ['Set the header to blue', 'Make the header gradient'],
  },
  footer: {
    description: 'Change the footer background color, gradient, image, or opacity.',
    examples: ['Make the footer dark', 'Set footer opacity to 80%'],
  },
  widget: {
    description: 'Change the widget container background, opacity, or overall visual properties.',
    examples: ['Set widget opacity to 50%', 'Make widget background transparent'],
  },
  vibe: {
    description: 'Apply an aesthetic vibe to the entire branding palette.',
    examples: ['Make it cyberpunk neon', 'Apply a minimalist style'],
  },
  addons: {
    description: 'Toggle AI features like the Insight Badge, Design Mirror, or Custom CSS.',
    examples: ['Enable the insight badge', 'Turn off design mirror'],
  },
  customCssSandbox: {
    description: 'A sandboxed code terminal beneath the Custom CSS toggle where users can inject raw CSS style overrides targeting the widget preview.',
    examples: [
      'Add glassmorphism to the widget',
      'Set the chat panel border-radius to 16px',
      'How do I add custom CSS to my widget?',
    ],
  },
  logoManagement: {
    description: 'Handles white-label corporate asset injection — upload custom logos to update the widget header.',
    examples: [
      'Change my widget logo',
      'How do I upload a new brand image?',
      'Replace the default branding icon',
    ],
  },
} as const;

// ── Acoustic Normalizer ────────────────────────────────────────────────
// Module-level utility for repairing STT phonetic distortions in high-frequency
// studio vocabulary. Whole-word, case-insensitive, regex-anchored so partial
// substrings are never corrupted.
const ACOUSTIC_VERB_MAP: ReadonlyMap<string, string> = new Map([
  ['doggle', 'toggle'],
  ['goggle', 'toggle'],
  ['five', 'vibe'],
  ['bide', 'vibe'],
]);

function normalizeAcousticCommand(input: string): string {
  return input.replace(/\b(doggle|goggle|five|bide)\b/gi, (match) =>
    ACOUSTIC_VERB_MAP.get(match.toLowerCase()) ?? match
  );
}

/** Parse a raw background value (hex, gradient string, or URL) into structured widget body fields. */
function parseWidgetBodyBackground(
  value: string | undefined
): { type: 'solid' | 'gradient' | 'image'; background: string; gradientStart: string; gradientEnd: string; image: string } {
  if (!value || typeof value !== 'string') {
    return { type: 'solid', background: '#1f2937', gradientStart: '#1f2937', gradientEnd: '#374151', image: '' };
  }
  if (isGradient(value)) {
    const [start, end] = parseGradient(value);
    return { type: 'gradient', background: start, gradientStart: start, gradientEnd: end, image: '' };
  }
  if (isImageBackground(value)) {
    return { type: 'image', background: value, gradientStart: '#1f2937', gradientEnd: '#374151', image: value };
  }
  return { type: 'solid', background: value, gradientStart: value, gradientEnd: '#374151', image: '' };
}

export function ClientBrandingStudio({
  clientId,
  resellerSlug,
  clients,
  onClientChange,
  initialConfig,
  planTier,
}: ClientBrandingStudioProps) {
  const [config, setConfig] = useState<BrandingConfig>({
    headerBackground: initialConfig?.branding?.headerBackground || '#0097b2',
    headerBackgroundType: initialConfig?.branding?.headerBackgroundType || 'solid',
    headerGradientStart: initialConfig?.branding?.headerGradientStart || '#0097b2',
    headerGradientEnd: initialConfig?.branding?.headerGradientEnd || '#226683',
    headerImage: initialConfig?.branding?.headerImage || '',
    headerOpacity: initialConfig?.branding?.headerOpacity || 0.75,
    footerBackground: initialConfig?.branding?.footerBackground || '#050a14',
    footerBackgroundType: initialConfig?.branding?.footerBackgroundType || 'solid',
    footerGradientStart: initialConfig?.branding?.footerGradientStart || '#050a14',
    footerGradientEnd: initialConfig?.branding?.footerGradientEnd || '#1a1a2e',
    footerImage: initialConfig?.branding?.footerImage || '',
    footerOpacity: initialConfig?.branding?.footerOpacity || 0.75,
    logoUrl: initialConfig?.branding?.logoUrl || '',
    brandName: initialConfig?.branding?.brandName || '',
    aiInsightBadge: initialConfig?.features?.aiInsightBadge ?? true,
    aiDesignMirror: initialConfig?.features?.aiDesignMirror ?? false,
    customCss: initialConfig?.features?.customCss ?? false,
    customCssCode: initialConfig?.branding?.customCssCode || '',
    voiceFeaturesEnabled: initialConfig?.features?.voiceFeaturesEnabled ?? true,
    localFallbackAlert: initialConfig?.features?.localFallbackAlert ?? false,
    defaultTtsVoice: initialConfig?.defaultTtsVoice || 'hannah',
    widgetBodyOpacity: initialConfig?.branding?.widgetBodyOpacity ?? 1.0,
    widgetBodyBackground: initialConfig?.branding?.widgetBodyBackground || 'rgba(31, 41, 55, 1.0)',
    widgetBodyBackgroundType: (() => {
      const bg = initialConfig?.branding?.widgetBodyBackground;
      if (isGradient(bg) || isImageBackground(bg)) {
        return isGradient(bg) ? 'gradient' : 'image';
      }
      return 'solid';
    })(),
    widgetBodyGradientStart: (() => {
      const bg = initialConfig?.branding?.widgetBodyBackground;
      if (isGradient(bg)) {
        const [start] = parseGradient(bg ?? null);
        return start;
      }
      return initialConfig?.branding?.widgetBodyBackground || '#1f2937';
    })(),
    widgetBodyGradientEnd: (() => {
      const bg = initialConfig?.branding?.widgetBodyBackground;
      if (isGradient(bg)) {
        const [, end] = parseGradient(bg ?? null);
        return end;
      }
      return '#374151';
    })(),
    widgetBodyImage: (() => {
      const bg = initialConfig?.branding?.widgetBodyBackground;
      return isImageBackground(bg) ? (bg ?? '') : '';
    })(),
    widgetPosition: initialConfig?.branding?.widgetPosition || 'bottom-right',
  });

  const [suggestedActions, setSuggestedActions] = useState<SuggestedAction[]>(
    initialConfig?.suggestedActions ?? []
  );
  // Reseller acts on behalf of the client only after an explicit unlock,
  // keeping the default stance read-only (audit persists via logConfigChange).
  const [isAdminOverrideActive, setIsAdminOverrideActive] = useState(false);

  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [isAiSyncing, setIsAiSyncing] = useState(false);
  const [vibeInput, setVibeInput] = useState('');
  const [isSpeakerEnabled, setIsSpeakerEnabled] = useState(true);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [textCommand, setTextCommand] = useState('');
  const [isProcessingText, setIsProcessingText] = useState(false);
  const userHasTypedRef = useRef(false);

  // Guided Onboarding State
  const [showGuidedSetup, setShowGuidedSetup] = useState(false);

  // Voice-Visual Harmony State
  const [generatedGreeting, setGeneratedGreeting] = useState<string>(initialConfig?.greeting || '');
  const [greetingExplanation, setGreetingExplanation] = useState<string>('');
  const [showGreetingPreview, setShowGreetingPreview] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);



  // Conversational Greeting Edit State
  const [isLongFormSTT, setIsLongFormSTT] = useState(false);
  const [dictatedGreeting, setDictatedGreeting] = useState<string>('');

  // Refs to avoid TDZ with startListening/stopListening from useVoiceCommand
  const startListeningRef = useRef<() => void>(() => {});
  const stopListeningRef = useRef<() => void>(() => {});

  // (PTT replaces forcedContinuousMode — retained only for hook compat)

  // Consume Hannah state from global context
  const { isHannahAwake, setIsHannahAwake, setHasGreeted } = useHannah();
  // Synchronous lock to prevent double-fire during async greeting fetch
  const greetingLockRef = useRef(false);

  // Resolve resellerSlug from URL params as fallback (bypass prop-drilling gaps).
  // CRITICAL: decodeURIComponent prevents 404 when the URL contains encoded chars
  // (e.g. "my%20company" instead of "my company") — Next.js useParams() does NOT
  // always decode in Turbopack dev mode.
  const params = useParams();
  const rawSlug = (resellerSlug || params?.resellerSlug || '') as string;
  const effectiveResellerSlug = rawSlug ? decodeURIComponent(rawSlug) : '';

  // ═══════════════════════════════════════════════════════════════════════
  // Slug Ref (Context Hygiene for TTS)
  // Decouples the async TTS engine from React's rapid hydration/shift cycles.
  // The `tts` callback reads from this ref instead of the closure-captured
  // `effectiveResellerSlug`, ensuring Hannah never attempts a synthesis call
  // with an undefined or stale reseller identity.
  // ═══════════════════════════════════════════════════════════════════════
  const resellerSlugRef = useRef(effectiveResellerSlug);
  useEffect(() => {
    resellerSlugRef.current = effectiveResellerSlug || resellerSlug;
  }, [effectiveResellerSlug, resellerSlug]);

  // Initialize the Branding Studio Hook
  const studio = useBrandingStudio(effectiveResellerSlug);

  // ── Tenant Switch Guard (Ref) ──────────────────────────────────────
  // Tracks the last-applied tenant ID so we only re-sync branding config
  // when the tenant actually changes, not on every render.
  // Using a ref instead of state because this value is only used for
  // comparison and never drives UI — avoids the react-hooks/set-state-in-effect lint.
  const lastAppliedTenantIdRef = useRef<string | null>(null);

  // ════════════════════════════════════════════════════════════════════
  // Synchronization Effect — moved from render-time setState to useEffect
  // to prevent cascading re-renders and comply with React 19 best practices.
  // This effect runs only when:
  //   1. studio finishes loading
  //   2. staging values differ from local config
  //   3. tenantId actually changes
  //   4. AND tenant branding was NOT explicitly provided via initialConfig
  //      (in which case tenant data takes precedence over reseller defaults)
  // ════════════════════════════════════════════════════════════════════
  const tenantIdForSync = clientId;
  const hasTenantBranding = !!initialConfig?.branding;
  useEffect(() => {
    if (studio.isLoading) return;

    // When tenant branding was explicitly provided via initialConfig,
    // do NOT overwrite it with reseller staging defaults.
    if (hasTenantBranding) return;

    const currentStaging = {
      primaryColor: studio.staging.primaryColor,
      accentColor: studio.staging.accentColor,
      logoUrl: studio.staging.logoUrl,
    };

    // Tenant Guard: only re-sync when tenant actually switches
    if (lastAppliedTenantIdRef.current === tenantIdForSync) return;

    lastAppliedTenantIdRef.current = tenantIdForSync;

    // Hydrate local config from staging — uses updater function to avoid
    // stale closures and complies with react-hooks/set-state-in-effect
    // because setConfig with an updater is the approved pattern.
    setConfig(prev => {
      // No-op if config already matches — prevents unnecessary re-renders
      if (
        prev.headerBackground === currentStaging.primaryColor &&
        prev.footerBackground === currentStaging.accentColor &&
        prev.logoUrl === (currentStaging.logoUrl || prev.logoUrl)
      ) {
        return prev;
      }
      return {
        ...prev,
        headerBackground: currentStaging.primaryColor,
        // Preserve gradient type and end color — only override the base color,
        // not the full gradient config (prevents solid-default clobber).
        ...(prev.headerBackgroundType !== 'solid' && prev.headerGradientEnd
          ? {}
          : { footerBackground: currentStaging.accentColor }),
        footerBackground: currentStaging.accentColor,
        logoUrl: currentStaging.logoUrl || prev.logoUrl,
      };
    });
  }, [
    studio.isLoading,
    studio.staging.primaryColor,
    studio.staging.accentColor,
    studio.staging.logoUrl,
    tenantIdForSync,
    hasTenantBranding,
  ]);

  // Self-contained TTS for ambient/greeting speech.
  // Independent of the mic pipeline's AudioContext — creates a fresh one per call
  // so page-load greetings work even before the user clicks the mic.
  // KEY: Uses resellerSlugRef.current instead of closure-captured effectiveResellerSlug
  // so that async TTS calls always have the latest resolved slug, even if the
  // component re-renders or hydration occurs mid-execution.
  const tts = useCallback(async (text: string, overrideSlug?: string) => {
    if (!isSpeakerEnabled) return;
    if (!isHannahAwake && !text.includes('going to sleep') && !text.includes('awake')) return;
    if (!text) return;
    // Strict fallback chain: override > ref > closure-captured value
    const activeSlug = overrideSlug || resellerSlugRef.current || effectiveResellerSlug;
    if (!activeSlug) {
      console.warn('[TTS] Skipping synthesis — resellerSlug not yet resolved');
      return;
    }
    try {
       const response = await fetch('/api/ai/speech', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ text, voice: config.defaultTtsVoice || 'hannah', resellerSlug: activeSlug }),
       });
       if (!response.ok) return;
       const arrayBuffer = await response.arrayBuffer();
       const ctx = new AudioContext();
       const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
       const source = ctx.createBufferSource();
       source.buffer = audioBuffer;
       source.connect(ctx.destination);
       source.start(0);
       source.onended = () => ctx.close();
     } catch (err) {
       console.error('[TTS] Greeting playback failed:', err);
     }
   }, [isSpeakerEnabled, isHannahAwake, effectiveResellerSlug, config.defaultTtsVoice]);

  // --- MOVED UP: Callback Definitions to resolve TDZ (Temporal Dead Zone) ---

  const syncBrandWithURL = useCallback(async () => {
    if (!clientId) return;
    setIsAiSyncing(true);
    setSaveMessage(null);

    try {
      const response = await fetch('/api/ai/sync-brand', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId }),
      });

      if (!response.ok) {
        throw new Error('Failed to sync brand from URL');
      }

      const data = await response.json();
      tts("I've analyzed the website and synced your brand colors.");
      return data;
    } catch (err) {
      console.error('Brand sync error:', err);
      tts('I had trouble syncing the brand. Please try again.');
    } finally {
      setIsAiSyncing(false);
    }
  }, [clientId, tts]);

  const applyAIVibe = useCallback(async (vibe: string) => {
    if (!clientId) return;
    setIsAiSyncing(true);

    try {
      const response = await fetch('/api/ai/apply-vibe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, vibe, currentConfig: config }),
      });

      if (!response.ok) {
        throw new Error('Failed to apply AI vibe');
      }

      const data = await response.json();
      tts(`Applied the ${vibe} vibe. How does it look?`);
      return data;
    } catch (err) {
      console.error('AI vibe error:', err);
      tts('I had trouble applying the AI vibe. Please try again.');
    } finally {
      setIsAiSyncing(false);
    }
  }, [clientId, config, tts]);

  const generateHarmoniousGreeting = useCallback(async () => {
    if (!clientId || !clients.length) return;

    try {
      const selectedClient = clients.find(c => c.id === clientId);
      if (!selectedClient) return;

      const visualStyle: VisualStyle = {
        headerType: config.headerBackgroundType,
        primaryColor: config.headerBackground,
        secondaryColor: config.headerBackgroundType === 'gradient' ? config.headerGradientEnd : undefined,
        opacity: config.headerOpacity,
        hasGlassmorphism: config.headerBackgroundType === 'gradient' && config.headerOpacity < 0.9,
        industry: selectedClient.industry
      };

      const { greeting, explanation } = createHarmoniousGreeting(
        visualStyle,
        selectedClient.name,
        selectedClient.industry
      );

      setGeneratedGreeting(greeting);
      setGreetingExplanation(explanation);
      tts(explanation);

      setTimeout(() => {
        tts("Listen to how it sounds...");
        setTimeout(() => {
          tts(greeting);
          setShowGreetingPreview(true);
        }, 1000);
      }, 3000);

    } catch (err) {
      console.error('Greeting generation error:', err);
      tts('I had trouble creating the greeting. Let me try a simpler approach.');
    }
  }, [clientId, clients, config, tts]);

  const executeFullDesignPass = useCallback(async () => {
    tts('Running complete brand analysis and design optimization. This might take a moment...');
    try {
      await syncBrandWithURL();
      const selectedClient = clients.find(c => c.id === clientId);
      if (selectedClient?.industry) {
        const vibeDescription = `${selectedClient.industry} optimized professional branding`;
        await applyAIVibe(vibeDescription);
      }
      if (planTier && planTier !== 'standard') {
        setConfig(prev => ({
          ...prev,
          headerBackgroundType: 'gradient',
          headerGradientStart: '#0891b2',
          headerGradientEnd: '#0e7490',
          headerOpacity: 0.85,
        }));
        tts('Applied premium glassmorphic effects for modern appeal.');
      }
      tts('Full design pass complete! Your brand now has optimized colors, professional styling, and enhanced visual appeal.');
    } catch (err) {
      console.error('Full design pass error:', err);
      tts('I encountered an issue during the design pass. Let me try a simpler approach.');
    }
  }, [clientId, clients, planTier, tts, applyAIVibe, syncBrandWithURL]);

  const applySuggestedConfig = useCallback(async () => {
    setShowGuidedSetup(false);
    tts('Applying the suggested design now.');
    await executeFullDesignPass();
  }, [executeFullDesignPass, tts]);

  const stopLongFormSTT = useCallback(() => {
    setIsLongFormSTT(false);
    setGeneratedGreeting(dictatedGreeting);
    setGreetingExplanation('Dictated by you - ready to save!');
    stopListeningRef.current();
    tts('Got it! Your dictated greeting has been saved.');
  }, [dictatedGreeting, tts]);

  const openClientSelector = useCallback(() => {
    setShowGuidedSetup(false);
    tts('You can choose another client from the client list on the left.');
  }, [tts]);

  // --- END MOVED UP ---

  /** Shared theme-palette merge engine — used by both SET_COLOR and UPDATE_THEME_COLORS / APPLY_VIBE actions.
   *  Also accepts optional component-scoped blocks (header, footer, widget) that carry
    *  component-specific properties which override the generic theme values. */

  const canonicalBranding = useMemo<Partial<CanonicalBranding>>(() => {
    const backgroundType = config.headerBackgroundType as 'solid' | 'gradient' | 'image';
    const footerBgType = config.footerBackgroundType as 'solid' | 'gradient' | 'image';
    return {
      primaryColor: config.headerBackground,
      accentColor: config.footerBackground,
      logoUrl: config.logoUrl || undefined,
      brandName: config.brandName || undefined,
      widgetPosition: config.widgetPosition || 'bottom-right',
      header: {
        type: backgroundType,
        value: backgroundType === 'gradient'
          ? gradientValue(config.headerBackground, config.headerGradientEnd)
          : backgroundType === 'image'
            ? config.headerImage || null
            : config.headerBackground || null,
        opacity: config.headerOpacity,
        backdropBlur: false,
      },
      footer: {
        type: footerBgType,
        value: footerBgType === 'gradient'
          ? gradientValue(config.footerBackground, config.footerGradientEnd)
          : footerBgType === 'image'
            ? config.footerImage || null
            : config.footerBackground || null,
        opacity: config.footerOpacity,
        backdropBlur: false,
      },
      widgetBody: (() => {
        const bodyType = config.widgetBodyBackgroundType;
        let value: string | null = null;
        if (bodyType === 'gradient') {
          value = gradientValue(config.widgetBodyGradientStart, config.widgetBodyGradientEnd);
        } else if (bodyType === 'image') {
          value = config.widgetBodyImage || null;
        } else {
          value = config.widgetBodyBackground || null;
        }
        return {
          type: bodyType,
          value,
          opacity: config.widgetBodyOpacity,
          backdropBlur: bodyType === 'gradient' ? true : false,
        };
      })(),
      headerConfig: {
        type: backgroundType,
        colorStart: config.headerBackground,
        colorEnd: config.headerBackgroundType === 'gradient' ? config.headerGradientEnd : config.headerBackground,
        image: config.headerBackgroundType === 'image' ? config.headerImage || null : null,
        opacity: config.headerOpacity,
      },
      footerConfig: {
        type: footerBgType,
        colorStart: config.footerBackground,
        colorEnd: config.footerBackgroundType === 'gradient' ? config.footerGradientEnd : config.footerBackground,
        image: config.footerBackgroundType === 'image' ? config.footerImage || null : null,
        opacity: config.footerOpacity,
      },
      widgetBodyOpacity: config.widgetBodyOpacity,
      widgetBodyBackground: config.widgetBodyBackground,
    };
  }, [config]);

  const handleThemeUpdateEngine = useCallback((theme: Record<string, unknown>) => {
    setConfig(prev => {
      // No-op check to prevent jarring flicker when backend confirmation arrives
      if (
        (theme.primary === undefined || prev.headerBackground === theme.primary) &&
        (theme.secondary === undefined || prev.footerBackground === theme.secondary) &&
        (theme.logoUrl === undefined || prev.logoUrl === theme.logoUrl) &&
        (theme.headerOpacity === undefined || prev.headerOpacity === theme.headerOpacity) &&
        (theme.footerOpacity === undefined || prev.footerOpacity === theme.footerOpacity) &&
        (theme.widgetBodyOpacity === undefined || prev.widgetBodyOpacity === theme.widgetBodyOpacity) &&
        (theme.widgetBodyBackground === undefined || prev.widgetBodyBackground === theme.widgetBodyBackground) &&
        (theme.widgetBodyBackgroundType === undefined || prev.widgetBodyBackgroundType === theme.widgetBodyBackgroundType) &&
        (theme.widgetBodyGradientStart === undefined || prev.widgetBodyGradientStart === theme.widgetBodyGradientStart) &&
        (theme.widgetBodyGradientEnd === undefined || prev.widgetBodyGradientEnd === theme.widgetBodyGradientEnd) &&
        (theme.widgetBodyImage === undefined || prev.widgetBodyImage === theme.widgetBodyImage)
      ) {
        return prev;
      }

      const widgetBodyPatch = theme.widgetBodyBackground !== undefined
        ? parseWidgetBodyBackground(theme.widgetBodyBackground as string)
        : null;

      return {
        ...prev,
        ...(theme.primary !== undefined && { headerBackground: theme.primary as string }),
        ...(theme.secondary !== undefined && { footerBackground: theme.secondary as string }),
        ...(theme.backgroundType !== undefined && {
          headerBackgroundType: theme.backgroundType as 'solid' | 'gradient' | 'image',
          footerBackgroundType: theme.backgroundType as 'solid' | 'gradient' | 'image',
        }),
        ...(theme.primaryGradientStart !== undefined && { headerGradientStart: theme.primaryGradientStart as string }),
        ...(theme.primaryGradientEnd !== undefined && { headerGradientEnd: theme.primaryGradientEnd as string }),
        ...(theme.secondaryGradientStart !== undefined && { footerGradientStart: theme.secondaryGradientStart as string }),
        ...(theme.secondaryGradientEnd !== undefined && { footerGradientEnd: theme.secondaryGradientEnd as string }),
        ...(theme.opacity !== undefined && { headerOpacity: theme.opacity as number, footerOpacity: theme.opacity as number }),
        ...(theme.logoUrl !== undefined && { logoUrl: theme.logoUrl as string }),
        // ── Component-Scoped Overrides ─────────────────────────────────
        // These handle explicit header/footer/widget blocks returned by the AI
        // payload. Each block carries component-specific properties that override
        // the generic theme values above (e.g. header.opacity != footer.opacity).
        ...(theme.headerBackground !== undefined && { headerBackground: theme.headerBackground as string }),
        ...(theme.headerBackgroundType !== undefined && { headerBackgroundType: theme.headerBackgroundType as 'solid' | 'gradient' | 'image' }),
        ...(theme.headerGradientStart !== undefined && { headerGradientStart: theme.headerGradientStart as string }),
        ...(theme.headerGradientEnd !== undefined && { headerGradientEnd: theme.headerGradientEnd as string }),
        ...(theme.headerOpacity !== undefined && { headerOpacity: theme.headerOpacity as number }),
        ...(theme.footerBackground !== undefined && { footerBackground: theme.footerBackground as string }),
        ...(theme.footerBackgroundType !== undefined && { footerBackgroundType: theme.footerBackgroundType as 'solid' | 'gradient' | 'image' }),
        ...(theme.footerGradientStart !== undefined && { footerGradientStart: theme.footerGradientStart as string }),
        ...(theme.footerGradientEnd !== undefined && { footerGradientEnd: theme.footerGradientEnd as string }),
        ...(theme.footerOpacity !== undefined && { footerOpacity: theme.footerOpacity as number }),
        ...(theme.widgetOpacity !== undefined && { headerOpacity: theme.widgetOpacity as number, footerOpacity: theme.widgetOpacity as number }),
        // ── Chat Body (Widget) Transparency & Background ────────────────
        ...(theme.widgetBodyOpacity !== undefined && { widgetBodyOpacity: theme.widgetBodyOpacity as number }),
        ...(theme.widgetBodyBackgroundType !== undefined && { widgetBodyBackgroundType: theme.widgetBodyBackgroundType as 'solid' | 'gradient' | 'image' }),
        ...(theme.widgetBodyGradientStart !== undefined && { widgetBodyGradientStart: theme.widgetBodyGradientStart as string }),
        ...(theme.widgetBodyGradientEnd !== undefined && { widgetBodyGradientEnd: theme.widgetBodyGradientEnd as string }),
        ...(theme.widgetBodyImage !== undefined && { widgetBodyImage: theme.widgetBodyImage as string }),
        ...(widgetBodyPatch && {
          widgetBodyBackground: widgetBodyPatch.background,
          widgetBodyBackgroundType: widgetBodyPatch.type,
          widgetBodyGradientStart: widgetBodyPatch.gradientStart,
          widgetBodyGradientEnd: widgetBodyPatch.gradientEnd,
          widgetBodyImage: widgetBodyPatch.image,
        }),
      };
    });
  }, []);

  /** Central Commit Wrapper: Bridges UI state to the tenant's persistent config
   *  in a single atomic transaction via the atomic update-config API.
   *
   *  ATOMIC SINGLE-WRITE PIPELINE (Production Safety):
   *   Aggregates the entire visual profile (branding) and functional feature
   *   matrix (features) into one consolidated payload. Sends it to the
   *   sync_tenant_config RPC which wraps both writes in a single PostgreSQL
   *   transaction block. If either write fails, the entire transaction rolls
   *   back instantly — no partial-save state.
   *
   *  This replaces the old dual-write pipeline that called studio.commit()
   *  (reseller table) independently from the features API (tenants table),
   *  which created split-brain save risks. */
  const handleCommit = useCallback(async (): Promise<boolean> => {
    const studioConfig = {
      branding: canonicalBranding,
      features: {
        aiInsightBadge: config.aiInsightBadge,
        aiDesignMirror: config.aiDesignMirror,
        customCss: config.customCss,
        voiceFeaturesEnabled: config.voiceFeaturesEnabled,
        localFallbackAlert: config.localFallbackAlert,
      },
      aiPersona: {
        voiceId: config.defaultTtsVoice,
      },
      suggestedActions,
      greeting: generatedGreeting || '',
    };

    const consolidatedPayload = {
      tenantId: clientId,
      studioConfig,
    };

    try {
      const response = await fetch('/api/client/update-studio-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(consolidatedPayload),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error((errorBody as Record<string, unknown>).error as string || 'Atomic commit failed');
      }

      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error('[ClientBrandingStudio] Atomic commit error:', err);
      setSaveMessage(`Error: ${errorMessage}`);
      return false;
    }
  }, [config, clientId, suggestedActions, generatedGreeting, canonicalBranding]);

  // Handle save — uses atomic commit pipeline with version_stamp optimistic locking
  const handleSave = useCallback(async () => {
    setIsSaving(true);
    setSaveMessage(null);

    try {
      const success = await handleCommit();
      if (!success) return;

      setSaveMessage('✨ Perfect! Both the visual design and greeting have been saved.');
      tts('Excellent! Your complete branding setup is now live.');
      setShowGreetingPreview(false);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setSaveMessage(errorMessage || 'Error saving configuration');
      tts('Sorry, I had trouble saving your changes.');
      console.error('[ClientBrandingStudio] Save error:', err);
    } finally {
      setIsSaving(false);
    }
  }, [handleCommit, tts]);

  const dispatchStudioAction = useCallback(async (action: StudioAction): Promise<void> => {
    switch (action.type) {
      case 'TOGGLE_INSIGHTS':
      case 'TOGGLE_DESIGN_MIRROR':
      case 'SET_CUSTOM_CSS': {
        setConfig(prev => ({
          ...prev,
          ...(action.type === 'TOGGLE_INSIGHTS'      && { aiInsightBadge: action.payload.enabled }),
          ...(action.type === 'TOGGLE_DESIGN_MIRROR' && { aiDesignMirror: action.payload.enabled }),
          ...(action.type === 'SET_CUSTOM_CSS'       && { customCss: action.payload.enabled }),
        }));
        break;
      }

      case 'UPDATE_THEME_COLORS':
      case 'APPLY_VIBE': {
        // Build an explicit, flat override map for component layout states.
        // Intercept nested component keys (header, footer, widget) and map
        // their nested properties to the flat schema keys that
        // handleThemeUpdateEngine expects (e.g. header.opacity -> headerOpacity)
        // instead of naively spreading nested blocks as root-level keys.
        const componentOverrides: Record<string, unknown> = {};

        if (action.payload?.header && typeof action.payload.header === 'object') {
          const h = action.payload.header as Record<string, unknown>;
          if (h.opacity !== undefined) componentOverrides.headerOpacity = h.opacity;
          if (h.background !== undefined) componentOverrides.headerBackground = h.background;
          if (h.backgroundType !== undefined) componentOverrides.headerBackgroundType = h.backgroundType;
          if (h.gradientStart !== undefined) componentOverrides.headerGradientStart = h.gradientStart;
          if (h.gradientEnd !== undefined) componentOverrides.headerGradientEnd = h.gradientEnd;
        }
        if (action.payload?.footer && typeof action.payload.footer === 'object') {
          const f = action.payload.footer as Record<string, unknown>;
          if (f.opacity !== undefined) componentOverrides.footerOpacity = f.opacity;
          if (f.background !== undefined) componentOverrides.footerBackground = f.background;
          if (f.backgroundType !== undefined) componentOverrides.footerBackgroundType = f.backgroundType;
          if (f.gradientStart !== undefined) componentOverrides.footerGradientStart = f.gradientStart;
          if (f.gradientEnd !== undefined) componentOverrides.footerGradientEnd = f.gradientEnd;
        }
        if (action.payload?.widget && typeof action.payload.widget === 'object') {
          const w = action.payload.widget as Record<string, unknown>;
          if (w.opacity !== undefined) componentOverrides.widgetOpacity = w.opacity;
          if (w.background !== undefined) componentOverrides.widgetBackground = w.background;
          if (w.bodyOpacity !== undefined) componentOverrides.widgetBodyOpacity = w.bodyOpacity;
          if (w.bodyBackgroundType !== undefined) componentOverrides.widgetBodyBackgroundType = w.bodyBackgroundType;
          if (w.bodyBackground !== undefined) {
            const parsed = parseWidgetBodyBackground(w.bodyBackground as string);
            componentOverrides.widgetBodyBackgroundType = parsed.type;
            componentOverrides.widgetBodyBackground = parsed.background;
            componentOverrides.widgetBodyGradientStart = parsed.gradientStart;
            componentOverrides.widgetBodyGradientEnd = parsed.gradientEnd;
            componentOverrides.widgetBodyImage = parsed.image;
          }
          if (w.gradientStart !== undefined) componentOverrides.widgetBodyGradientStart = w.gradientStart;
          if (w.gradientEnd !== undefined) componentOverrides.widgetBodyGradientEnd = w.gradientEnd;
          if (w.bodyImage !== undefined) componentOverrides.widgetBodyImage = w.bodyImage;
        }

        // Blend theme-level properties, raw text payload properties, and
        // the explicitly flattened component overrides into a single
        // unified theme layout object before forwarding to the engine.
        const mergedTheme: Record<string, unknown> = {
          ...(action.payload?.theme || {}),
          ...componentOverrides,
        };

        // Defensive catch-all for LLM token drift where opacity is attached directly to the theme root
        if (mergedTheme.opacity !== undefined) {
          // If headerOpacity wasn't already explicitly set by a nested block, map the root property to the header
          if (mergedTheme.headerOpacity === undefined) {
            mergedTheme.headerOpacity = mergedTheme.opacity;
          }
          // Clean up the structural orphan so it doesn't pollute the state tree
          delete mergedTheme.opacity;
        }

        // Double check the action payload root as well for absolute structural safety
        const payloadAsRecord = action.payload as Record<string, unknown> | undefined;
        if (payloadAsRecord?.opacity !== undefined && mergedTheme.headerOpacity === undefined) {
          mergedTheme.headerOpacity = payloadAsRecord.opacity;
        }

        if (Object.keys(mergedTheme).length > 0) {
          handleThemeUpdateEngine(mergedTheme);
        }
        break;
      }

      case 'APPLY_BRAND_VIBE': {
        if (action.payload?.vibeText) {
          setVibeInput(action.payload.vibeText); // Visual feedback echo
          await applyAIVibe(action.payload.vibeText);
        }
        break;
      }

      case 'SAVE_STUDIO_CONFIG': {
        await handleSave(); // Concrete async Supabase persistence
        break;
      }

      case 'TRIGGER_AI_MAGIC': {
        await syncBrandWithURL(); // Concrete layout optimization pass
        break;
      }

      default: {
        console.warn(`[StudioDispatcher] Unhandled or unexpected action type: ${(action as StudioAction).type}`);
        break;
      }
    }
  }, [handleThemeUpdateEngine, applyAIVibe, handleSave, syncBrandWithURL]);

  /** System Command Console: dispatch typed text through the same /api/ai/process-command
   *  pipeline the voice path uses, ensuring identical action derivation and UI state updates. */
  const handleTextCommand = useCallback(async (text: string) => {
    // IMMUTABLE CONTEXT SNAP: freeze the slug at invocation so async gaps
    // can't corrupt the downstream TTS call with a stale/undefined value.
    const contextualSlug = resellerSlug;
    console.log('[SST Console] Execution Triggered with Text:', text);
    console.log('[SST Console] isProcessingText at trigger:', isProcessingText);
    const normalized = normalizeAcousticCommand(text);
    console.log('[SST Console] Normalized:', normalized);
    const trimmed = normalized.trim();
    console.log('[SST Console] Trimmed:', JSON.stringify(trimmed), '| length:', trimmed.length);
    if (!trimmed || isProcessingText) {
      console.warn('[SST Console] Early return — empty input or already processing');
      return;
    }
    setIsProcessingText(true);
    const requestPayload = {
      resellerId: effectiveResellerSlug,
      userCommand: trimmed,
      currentConfig: config as unknown as Record<string, unknown>,
      tenantContext: { tenantId: clientId, category: 'GENERAL' as const },
      contextCapabilities: STUDIO_CAPABILITIES,
    };
    console.log('[SST Console] Assembling fetch payload:', requestPayload);
    try {
      console.log('[SST Console] Entering try block, dispatching fetch');
      const res = await fetch('/api/ai/process-command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestPayload),
      });
      console.log('[SST Console] Fetch response status:', res.status, res.statusText);
      if (!res.ok) throw new Error(`Process failed: ${res.status}`);
      const data = await res.json() as { actions?: IncomingAIAction[]; payload?: unknown; actionType?: string; summary?: string; response?: string };
      console.log('[SST Console] Raw response payload structure:', JSON.stringify(data.payload));
      console.log('[SST Console] Success: parsed response', { actionType: data?.actionType, summary: data?.summary, hasPayload: !!data?.payload });

      // ── Uni-filed Action Normalization ─────────────────────────────────
      // Normalizes both payload shapes (new explicit actions[] and legacy
      // singl-root actionType+payload) into a standardized IncomingAIAction[]
      // This mirrors deriveActionsFromPayload() in useVoiceCommand for 1:1
      // behavioral parity between voice and text pipelines.
      let actions: IncomingAIAction[] = [];
      if (Array.isArray(data?.actions)) {
        // ── Bidirectional Action Field Normalization ────────────────
        // Forces every element through an explicit mapping block:
        //   1. Unifies `actionType` -> `type` regardless of backend variant
        //   2. Translates `SYSTEM_UPDATE_BRANDING` -> `APPLY_VIBE`
        // This guarantees the frontend reducer receives a uniform contract
        // from both the voice pipeline and the typing text console.
        // Cast through `unknown` because IncomingAIAction is a discriminated
        // union — the map lambda's inferred union is broader than the exact
        // variant type, but the normalization guarantees runtime safety.
        actions = (data.actions as Array<Record<string, unknown>>).map(act => {
          const rawType = ((act.type as string | undefined) || (act.actionType as string | undefined) || '') as string;
          const normalizedType = rawType === 'SYSTEM_UPDATE_BRANDING' ? 'APPLY_VIBE' : rawType;
          return { type: normalizedType, payload: (act.payload || {}) as Record<string, unknown> };
        }) as IncomingAIAction[];
      } else {
        const payload = data?.payload as Record<string, unknown> | undefined;
        const actionType = data?.actionType as string | undefined;
        if (payload && typeof payload === 'object') {
          // Extract UI toggle actions (mirrors deriveActionsFromPayload)
          const uiPayload = payload.ui as Record<string, unknown> | undefined;
          if (uiPayload && typeof uiPayload === 'object') {
            if (typeof uiPayload.aiInsightBadge === 'boolean') {
              actions.push({ type: 'TOGGLE_INSIGHTS', payload: { enabled: uiPayload.aiInsightBadge as boolean } });
            }
            if (typeof uiPayload.aiDesignMirror === 'boolean') {
              actions.push({ type: 'TOGGLE_DESIGN_MIRROR', payload: { enabled: uiPayload.aiDesignMirror as boolean } });
            }
            if (typeof uiPayload.customCss === 'boolean') {
              actions.push({ type: 'SET_CUSTOM_CSS', payload: { enabled: uiPayload.customCss as boolean } });
            }
          }
          // ── Component-Scoped Layout Properties ────────────────────────
          // Ensure header/footer/widget blocks are extracted alongside the
          // theme layout so component-specific overrides reach the reducer.
          // This mirrors deriveActionsFromPayload() in useVoiceCommand for
          // 1:1 behavioral parity between voice and text pipelines.
          if (payload.header || payload.footer || payload.widget || payload.theme) {
            const type: 'APPLY_VIBE' | 'UPDATE_THEME_COLORS' =
              actionType === 'SYSTEM_UPDATE_BRANDING' ? 'APPLY_VIBE' : 'UPDATE_THEME_COLORS';
            actions.push({
              type,
              payload: {
                theme: (payload.theme || {}) as Record<string, unknown>,
                header: payload.header as Record<string, unknown> | undefined,
                footer: payload.footer as Record<string, unknown> | undefined,
                widget: payload.widget as Record<string, unknown> | undefined,
              },
            });
          }
        }
      }
      console.log('[SST Console] Normalized actions for dispatch:', actions.length);
      for (const action of actions) {
        await dispatchStudioAction(action);
      }
      // ── SYSTEM_HELP TTS Fallback ─────────────────────────────────────────
      // The voice pipeline intentionally skips automatic TTS for SYSTEM_ macros,
      // so we must explicitly trigger the local synthesis engine for help content.
      // This mirrors the fallback pattern used in ClientsGrid for feature parity.
      if (data?.actionType === 'SYSTEM_HELP') {
        const helpText = data.response || data.summary;
        if (helpText && isSpeakerEnabled && isHannahAwake) {
          void tts(helpText, contextualSlug).catch((ttsErr) => {
            console.error('[SST Console] SYSTEM_HELP TTS failed (non-fatal):', ttsErr);
          });
        }
      }
      // Vocal confirmation layer — fire-and-forget so it never blocks
      // the input clearing, the isProcessingText reset, or any UI state.
      // Audio errors are caught by the local .catch and never cascade.
      if (data?.summary && data?.actionType !== 'SYSTEM_HELP' && isSpeakerEnabled && isHannahAwake) {
        // Thread the immutable context snap to prevent slug drift during async TTS
        void tts(data.summary, contextualSlug).catch((ttsErr) => {
          console.error('[SST Console] TTS read-back failed (non-fatal):', ttsErr);
        });
      }
      // Clear the console if UI actions were triggered OR if a conversational system macro matched successfully
      const isConversationalSuccess = data?.actionType?.startsWith('SYSTEM_');
      const isStandardMatch = actions.length > 0;

      if (isStandardMatch || isConversationalSuccess) {
        setTextCommand('');
        userHasTypedRef.current = false;
        console.log('[SST Console] Console cleared after successful dispatch');
      } else {
        console.warn('[SST] Command parsed with zero actionable intents — retaining text for correction.');
      }
    } catch (err) {
      console.error('[SST Console] Error caught during dispatch:', err);
      setTextCommand(trimmed);
      userHasTypedRef.current = true;
    } finally {
      setIsProcessingText(false);
      console.log('[SST Console] isProcessingText reset in finally');
    }
  }, [clientId, config, effectiveResellerSlug, dispatchStudioAction, isProcessingText, isSpeakerEnabled, isHannahAwake, resellerSlug, tts]);

  // Stream live STT transcript into the console input while the user hasn't started typing manually
  useEffect(() => {
    if (!userHasTypedRef.current && voiceTranscript) {
      setTextCommand(voiceTranscript);
    }
  }, [voiceTranscript]);

  // Re-hydrate local config from the deep-merged widget_config written by the AI engine
  const handleAIComplete = useCallback(async (_aiResponseText?: string, aiPayload?: unknown) => {
    // Legacy fallback: handle raw payload shapes for backward-compat with older server builds
    // that don't return an explicit `actions` array. The new `onActionsReceived` path handles
    // the canonical IncomingAIAction[] — this path only fires when actions[] is absent.
    if (aiPayload && typeof aiPayload === 'object' && 'theme' in (aiPayload as Record<string, unknown>)) {
      const p = aiPayload as Record<string, unknown>;
      if (p.theme && typeof p.theme === 'object') {
        handleThemeUpdateEngine(p.theme as Record<string, unknown>);
      }
      if (p.ui && typeof p.ui === 'object') {
        const ui = p.ui as Record<string, unknown>;
        setConfig(prev => ({
          ...prev,
          ...(typeof ui.aiInsightBadge === 'boolean' && { aiInsightBadge: ui.aiInsightBadge }),
          ...(typeof ui.aiDesignMirror === 'boolean' && { aiDesignMirror: ui.aiDesignMirror }),
          ...(typeof ui.customCss === 'boolean' && { customCss: ui.customCss }),
        }));
      }
    }

    if (!clientId) return;
    try {
      const response = await fetch(`/api/tenants/${clientId}`);
      if (!response.ok) return;
      const tenant = await response.json();
      const widgetConfig = tenant.widget_config || {};
      const branding = (widgetConfig.branding || {}) as Record<string, unknown>;
      const headerConfig = (branding.headerConfig as Record<string, unknown> | undefined) || {};
      const footerConfig = (branding.footerConfig as Record<string, unknown> | undefined) || {};
      const features = (widgetConfig.features || {}) as { aiInsightBadge?: boolean; aiDesignMirror?: boolean; customCss?: boolean; voiceFeaturesEnabled?: boolean; localFallbackAlert?: boolean };
      const aiSettings = (widgetConfig.ai_settings || {}) as { voiceId?: string };
      const theme = (widgetConfig.theme || {}) as Record<string, unknown>;

      const flattenHeaderType = (type: unknown) => ((type as string) === 'gradient' || (type as string) === 'solid' || (type as string) === 'image') ? type as 'solid' | 'gradient' | 'image' : 'solid';
      const flattenFooterType = (type: unknown) => ((type as string) === 'gradient' || (type as string) === 'solid' || (type as string) === 'image') ? type as 'solid' | 'gradient' | 'image' : 'solid';

      setConfig(prev => ({
        ...prev,
        headerBackground: (headerConfig.colorStart as string) || (branding.headerBackground as string) || (theme.primary as string) || prev.headerBackground,
        headerBackgroundType: flattenHeaderType(headerConfig.type) || flattenHeaderType(branding.headerBackgroundType) || (theme.backgroundType as string) || prev.headerBackgroundType,
        headerGradientStart: (headerConfig.colorStart as string) || (branding.headerGradientStart as string) || (theme.primaryGradientStart as string) || prev.headerGradientStart,
        headerGradientEnd: (headerConfig.colorEnd as string) || (branding.headerGradientEnd as string) || (theme.primaryGradientEnd as string) || prev.headerGradientEnd,
        headerOpacity: (headerConfig.opacity ?? (branding.headerOpacity as number | undefined) ?? (theme.opacity as number | undefined) ?? prev.headerOpacity) as number,
        footerBackground: (footerConfig.colorStart as string) || (branding.footerBackground as string) || (theme.secondary as string) || prev.footerBackground,
        footerBackgroundType: flattenFooterType(footerConfig.type) || flattenFooterType(branding.footerBackgroundType) || (theme.backgroundType as string) || prev.footerBackgroundType,
        footerGradientStart: (footerConfig.colorStart as string) || (branding.footerGradientStart as string) || (theme.secondaryGradientStart as string) || prev.footerGradientStart,
        footerGradientEnd: (footerConfig.colorEnd as string) || (branding.footerGradientEnd as string) || (theme.secondaryGradientEnd as string) || prev.footerGradientEnd,
        footerOpacity: (footerConfig.opacity ?? (branding.footerOpacity as number | undefined) ?? (theme.opacity as number | undefined) ?? prev.footerOpacity) as number,
        logoUrl: (branding.logoUrl as string) || (theme.logoUrl as string) || prev.logoUrl,
        brandName: (branding.brandName as string) || prev.brandName,
        aiInsightBadge: (features.aiInsightBadge ?? prev.aiInsightBadge) as boolean,
        aiDesignMirror: (features.aiDesignMirror ?? prev.aiDesignMirror) as boolean,
        customCss: (features.customCss ?? prev.customCss) as boolean,
        voiceFeaturesEnabled: (features.voiceFeaturesEnabled ?? prev.voiceFeaturesEnabled) as boolean,
        localFallbackAlert: (features.localFallbackAlert ?? prev.localFallbackAlert) as boolean,
        defaultTtsVoice: (aiSettings.voiceId || prev.defaultTtsVoice) as string,
        widgetBodyOpacity: (branding.widgetBodyOpacity as number | undefined) ?? prev.widgetBodyOpacity,
        widgetBodyBackground: (branding.widgetBodyBackground as string) || prev.widgetBodyBackground,
      }));
      setGeneratedGreeting((widgetConfig.greeting as string) || '');
      setSuggestedActions((widgetConfig.suggestedActions as SuggestedAction[]) || []);

      // NOTE: DO NOT call tts() here for AI response text.
      // The internal pipeline in useVoiceCommand (processAudioPipeline) already
      // plays the TTS audio via AudioContext. Calling tts() here creates a
      // duplicate fire-and-forget fetch that races with the AudioContext playback,
      // causing no audio to reach the speakers (AudioContext state conflicts).
      setSaveMessage('\u2728 Branding updated by AI');
    } catch (_err) {
      console.error('Re-hydration fetch failed:', _err);
    }
  // tts intentionally excluded from deps — the AI response text is spoken by the
  // internal pipeline (processAudioPipeline), not by this standalone callback.
  }, [clientId, handleThemeUpdateEngine]);

  // Hydrate full branding config from persisted widget_config on client switch
  const hydratedClientIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!clientId || hydratedClientIdRef.current === clientId) return;
    hydratedClientIdRef.current = clientId;

    let isActive = true;
    async function hydrate() {
      try {
        const response = await fetch(`/api/tenants/${clientId}`);
        if (!response.ok) return;
        const tenant = await response.json();
        if (!isActive) return;
        const widgetConfig = tenant.widget_config || {};
        const branding = (widgetConfig.branding || {}) as Record<string, unknown>;
        const headerConfig = (branding.headerConfig as Record<string, unknown> | undefined) || {};
        const footerConfig = (branding.footerConfig as Record<string, unknown> | undefined) || {};
        const features = (widgetConfig.features || {}) as { aiInsightBadge?: boolean; aiDesignMirror?: boolean; customCss?: boolean; voiceFeaturesEnabled?: boolean; localFallbackAlert?: boolean };
        const aiSettings = (widgetConfig.ai_settings || {}) as { voiceId?: string };
        const theme = (widgetConfig.theme || {}) as Record<string, unknown>;

        const flattenHeaderType = (type: unknown) => ((type as string) === 'gradient' || (type as string) === 'solid' || (type as string) === 'image') ? type as 'solid' | 'gradient' | 'image' : 'solid';
        const flattenFooterType = (type: unknown) => ((type as string) === 'gradient' || (type as string) === 'solid' || (type as string) === 'image') ? type as 'solid' | 'gradient' | 'image' : 'solid';

        setConfig(prev => ({
          ...prev,
          headerBackground: (headerConfig.colorStart as string) || (branding.headerBackground as string) || (theme.primary as string) || prev.headerBackground,
          headerBackgroundType: flattenHeaderType(headerConfig.type) || flattenHeaderType(branding.headerBackgroundType) || (theme.backgroundType as string) || prev.headerBackgroundType,
          headerGradientStart: (headerConfig.colorStart as string) || (branding.headerGradientStart as string) || (theme.primaryGradientStart as string) || prev.headerGradientStart,
          headerGradientEnd: (headerConfig.colorEnd as string) || (branding.headerGradientEnd as string) || (theme.primaryGradientEnd as string) || prev.headerGradientEnd,
          headerOpacity: (headerConfig.opacity ?? (branding.headerOpacity as number | undefined) ?? (theme.opacity as number | undefined) ?? prev.headerOpacity) as number,
          footerBackground: (footerConfig.colorStart as string) || (branding.footerBackground as string) || (theme.secondary as string) || prev.footerBackground,
          footerBackgroundType: flattenFooterType(footerConfig.type) || flattenFooterType(branding.footerBackgroundType) || (theme.backgroundType as string) || prev.footerBackgroundType,
          footerGradientStart: (footerConfig.colorStart as string) || (branding.footerGradientStart as string) || (theme.secondaryGradientStart as string) || prev.footerGradientStart,
          footerGradientEnd: (footerConfig.colorEnd as string) || (branding.footerGradientEnd as string) || (theme.secondaryGradientEnd as string) || prev.footerGradientEnd,
          footerOpacity: (footerConfig.opacity ?? (branding.footerOpacity as number | undefined) ?? (theme.opacity as number | undefined) ?? prev.footerOpacity) as number,
          logoUrl: (branding.logoUrl as string) || (theme.logoUrl as string) || prev.logoUrl,
          brandName: (branding.brandName as string) || prev.brandName,
          aiInsightBadge: (features.aiInsightBadge ?? prev.aiInsightBadge) as boolean,
          aiDesignMirror: (features.aiDesignMirror ?? prev.aiDesignMirror) as boolean,
          customCss: (features.customCss ?? prev.customCss) as boolean,
          voiceFeaturesEnabled: (features.voiceFeaturesEnabled ?? prev.voiceFeaturesEnabled) as boolean,
          localFallbackAlert: (features.localFallbackAlert ?? prev.localFallbackAlert) as boolean,
          defaultTtsVoice: (aiSettings.voiceId || prev.defaultTtsVoice) as string,
          widgetBodyOpacity: (branding.widgetBodyOpacity as number | undefined) ?? prev.widgetBodyOpacity,
          widgetBodyBackground: (branding.widgetBodyBackground as string) || prev.widgetBodyBackground,
        }));

        const greeting = widgetConfig.greeting as string | undefined;
        if (greeting) {
          setGeneratedGreeting(greeting);
        }

        const sa = widgetConfig.suggestedActions as SuggestedAction[] | undefined;
        if (sa && sa.length > 0) {
          setSuggestedActions(sa);
        }
      } catch (err) {
        console.error('[ClientBrandingStudio] Client-switch rehydration failed:', err);
      }
    }

    hydrate();
    return () => { isActive = false; };
  }, [clientId, setConfig, setGeneratedGreeting, setSuggestedActions]);

  // ════════════════════════════════════════════════════════════════════
  // Stable Initialization: Voice pipeline options are memoized so that
  // useVoiceCommand receives stable references. This prevents the hook
  // from tearing down and rebuilding the mic pipeline on every parent
  // re-render (which caused the infinite "Loading..." cycle).
  // ════════════════════════════════════════════════════════════════════
  const voiceOptions = useMemo(() => ({
    forcedContinuousMode: false,
    silenceDuration: 3000,
    resellerId: effectiveResellerSlug,
    contextCapabilities: STUDIO_CAPABILITIES,
    tenantContext: { tenantId: clientId, category: 'GENERAL' as const },
    currentConfig: config as unknown as Record<string, unknown>,
  }), [
    effectiveResellerSlug,
    clientId,
    config,
  ]);

  // Stable transcript handler — split from options to avoid recreating
  // the entire voiceOptions object when only the handler deps change.
  const stableOnTranscript = useCallback((text: string) => {
    setVoiceTranscript(text);

    if (isLongFormSTT) {
      setDictatedGreeting(text);
    }

    const lowerText = text.toLowerCase();
    const sleepCommands = ['hannah go to sleep', 'hannah sleep', 'go to sleep', 'be quiet', 'stop talking'];
    if (sleepCommands.some(cmd => lowerText.includes(cmd))) {
      setIsHannahAwake(false);
      tts('Going to sleep. Just tap the mic when you need me again.');
      return;
    }

    const wakeCommands = ['hannah wake up', 'hannah awake', 'wake up', 'are you there'];
    if (wakeCommands.some(cmd => lowerText.includes(cmd))) {
      setIsHannahAwake(true);
      tts("I'm awake and ready to help!");
      return;
    }
  }, [isLongFormSTT, tts, setIsHannahAwake]);

  // Voice command hook for STT — Push-to-Talk (PTT) state machine
  const {
    isRecording,             // PTT: held down (replaces isListening)
    isProcessing,
    startRecording,          // PTT: mousedown / touchstart
    stopListeningAndProcess, // PTT: mouseup / touchend — finalizes + processes
    abortRecording,          // PTT: mouseleave / touchcancel
    resetState,              // Quiescent-state reset for navigation exit-paths
  } = useVoiceCommand({
    ...voiceOptions,
    onTranscript: stableOnTranscript,
    onAIResponse: handleAIComplete,
    // Execute actions sequentially to ensure asynchronous state determinism
    onActionsReceived: useCallback(async (actions: IncomingAIAction[]) => {
      for (const action of actions) {
        await dispatchStudioAction(action);
      }
    }, [dispatchStudioAction]),
  });

  // Sync refs for callbacks using the current hook methods
  useEffect(() => {
    startListeningRef.current = startRecording;
    stopListeningRef.current = stopListeningAndProcess;
  }, [startRecording, stopListeningAndProcess]);

  // ── Navigation Exit-Path ────────────────────────────────────────────────
  // Reset component-level state (greeting latch) and ask the voice-command
  // hook to quiesce before navigating. Order is critical: refs must be
  // cleared BEFORE router.push fires so the next studio mount never inherits
  // a stuck lock. The hard-coded slug mirrors the reseller's primary route.
  const router = useRouter();
  const handleBackToClients = useCallback(() => {
    greetingLockRef.current = false;
    setHasGreeted(false);
    resetState();
    router.push('/reseller/lastchaptermedia2016/clients');
  }, [resetState, router, setHasGreeted]);

  const updateConfig = (key: keyof BrandingConfig, value: string | number | boolean) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      const body = new FormData();
      body.append('file', file);
      body.append('tenantId', clientId);
      const res = await fetch('/api/reseller/upload-logo', {
        method: 'POST',
        body,
      });
      if (!res.ok) {
        let message = 'HTTP ' + res.status;
        try {
          const errorBody = await res.json();
          message = (errorBody as Record<string, unknown>).error as string || message;
        } catch {
          // Non-JSON error response; fall back to HTTP status.
        }
        throw new Error(message);
      }
      const result = await res.json();
      setConfig((prev) => ({ ...prev, logoUrl: result.url as string }));
      setSaveMessage('Logo uploaded successfully');
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Logo upload failed';
      console.error('[ClientBrandingStudio] Logo upload error:', message, err);
      setSaveMessage(message);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [clientId]);

  // Feature locking based on plan tier
  const isFeatureLocked = useCallback((feature: string) => {
    if (!planTier) return false;
    const lockedFeatures: Record<string, string[]> = {
      'standard': ['aiInsightBadge', 'aiDesignMirror', 'customCss'],
      'professional': ['aiDesignMirror', 'customCss'],
      'enterprise': []
    };
    return lockedFeatures[planTier]?.includes(feature) || false;
  }, [planTier]);

  // Instant Save — saves both visuals and greeting with atomic commit
  const instantSave = useCallback(async () => {
    if (!generatedGreeting) return;

    setIsSaving(true);
    setSaveMessage(null);

    try {
      const success = await handleCommit();
      if (!success) return;

      // Save greeting after branding commit succeeds
      const greetingResponse = await fetch('/api/tenants/update-config-with-greeting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: clientId,
          configPatch: {},
          aiSettings: {
            initial_greeting: generatedGreeting,
            voice_persona: 'auto-generated',
          },
        }),
      });

      if (!greetingResponse.ok) {
          console.warn('[BrandingStudio] Greeting instant-save failed, but branding committed');
      }

      setSaveMessage('✨ Perfect! Both the visual design and greeting have been saved.');
      tts('Excellent! Your complete branding setup is now live.');
      setShowGreetingPreview(false);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setSaveMessage(errorMessage || 'Error saving configuration');
      tts('Sorry, I had trouble saving your changes.');
      console.error('[ClientBrandingStudio] Instant save error:', err);
    } finally {
      setIsSaving(false);
    }
  }, [handleCommit, clientId, generatedGreeting, tts]);

  // Gated Tenant Switch Announcement
  useEffect(() => {
    if (!clientId || !effectiveResellerSlug || greetingLockRef.current) return;

    const fetchAndConfirmClientSwitch = async () => {
      // Guard: skip if the slug hasn't resolved yet.
      // Reset the greeted flag so this retries once the slug is available.
      if (!effectiveResellerSlug) {
        greetingLockRef.current = false;
        setHasGreeted(false);
        console.warn('[TTS] Greeting skipped — resellerSlug not yet available');
        return;
      }

      try {
        // Check for wrong turn flag from redirect
        const wrongTurn = sessionStorage.getItem('hannah_wrong_turn');
        const welcomeBack = sessionStorage.getItem('hannah_welcome_back');

        // Mark as greeted BEFORE the async fetch to prevent double-fire races.
        // If a re-render happens during the await, the outer guard
        // (`greetingLockRef.current`) will block re-entry.
        greetingLockRef.current = true;
        setHasGreeted(true);

        // Fetch new client data
        const response = await fetch(`/api/tenants/${clientId}`);
        if (!response.ok) return;

        const clientData = await response.json();
        const clientName = clientData.name || 'this client';
        const brandingRationale = clientData.branding_rationale || '';

        // Only announce if Hannah is awake
        if (isHannahAwake) {
          // Welcome back message for wrong turn
          if (welcomeBack === 'true') {
            setTimeout(() => {
              tts(`Welcome back! I see you took a wrong turn, but we're back on track now. Let's get to work with ${clientName}.`);
            }, 500);

            // Clear the flags
            sessionStorage.removeItem('hannah_wrong_turn');
            sessionStorage.removeItem('hannah_welcome_back');
          } else {
            // Normal tenant switch greeting
            tts(`I see you've selected ${clientName}. Let's get to work.`);
          }

          // If there's a branding rationale, mention it briefly (no second delay for wrong turn)
          if (brandingRationale && brandingRationale.length > 0) {
            const delay = welcomeBack === 'true' ? 1500 : 2000; // Faster for wrong turn
            setTimeout(() => {
              tts(`Their brand focus: ${brandingRationale.substring(0, 100)}${brandingRationale.length > 100 ? '...' : ''}`);
            }, delay);
          }
        }

        greetingLockRef.current = true;
        setHasGreeted(true);
        console.log(`OVG-PLATFORM-V2: Tenant switch confirmed to ${clientName}${wrongTurn ? ' (with wrong turn correction)' : ''}`);
      } catch (err) {
        console.error('Error fetching client data for tenant switch:', err);
      }
    };

    fetchAndConfirmClientSwitch();
  }, [clientId, effectiveResellerSlug, isHannahAwake, tts, setHasGreeted]);

  // Handle initial load from redirect with immediate branding sync
  useEffect(() => {
    const welcomeBack = sessionStorage.getItem('hannah_welcome_back');
    const wrongTurn = sessionStorage.getItem('hannah_wrong_turn');

    if (welcomeBack === 'true' && wrongTurn === 'true' && clientId) {
      // Force immediate branding sync for redirect scenario
      const fetchClientForRedirect = async () => {
        try {
          const response = await fetch(`/api/tenants/${clientId}`);
          if (response.ok) {
            const clientData = await response.json();
            console.log(`OVG-PLATFORM-V2: Immediate branding sync for ${clientData.name} after redirect`);
          }
        } catch (err) {
          console.error('Error in immediate branding sync:', err);
        }
      };

      fetchClientForRedirect();
    }
  }, [clientId]);

  // ── Slug-Readiness Guard (Production Excellence) ─────────────────────
  // If the resellerSlug hasn't resolved yet (empty or invalid hydration proxy),
  // render a lightweight skeleton instead of the full studio. This prevents
  // hooks from initializing with undefined and getting stuck in a loading state.
  // Hooks are still called unconditionally above (satisfying React's rules),
  // but the UI is gated here.
  if (!effectiveResellerSlug || isInvalidSlug(effectiveResellerSlug)) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-white/40 text-sm animate-pulse">Resolving workspace...</div>
      </div>
    );
  }

  // ERROR GUARD: If the hook failed to load branding (e.g., invalid slug / 404),
  // show an error card instead of rendering the full studio UI with defaults.
  // Note: This is placed in the render return, NOT as an early return, to avoid
  // breaking React's rules of hooks (hooks must be called in the same order every render).
  if (studio.error) {
    return (
      <div className="backdrop-blur-xl bg-white/5 border border-red-500/30 rounded-xl p-8 text-center max-w-lg mx-auto mt-8">
        <div className="text-red-400 text-lg font-semibold mb-2">Branding Studio Unavailable</div>
        <p className="text-white/60 text-sm mb-4">{studio.error}</p>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-[#0097b2] hover:bg-[#0086a3] text-white text-sm rounded-lg transition-all"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left Panel: The Studio */}
      <div className="space-y-6">
        {/* Client Switcher Header */}
        <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-xl p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <span className="text-[#FFD700]">◆</span>
              Studio Controls
            </h2>
            <div className="flex items-center gap-3">
              {/* Voice-pipeline processing indicator — bound to isProcessing, not
                  studio.isLoading (the latter was a permanent ghost state).
                  The fixed-width container locks the layout so the
                  "Back to Clients" button and mic icon never shift. */}
              <div className="w-[68px] flex items-center justify-end">
                {isProcessing && (
                  <span className="text-xs text-slate-400 animate-pulse">Loading...</span>
                )}
              </div>
              {/* Back to Clients — navigation exit-path with pipeline quiesce */}
              <button
                type="button"
                onClick={handleBackToClients}
                aria-label="Back to clients"
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white/70 hover:text-white transition-colors rounded-lg"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                <span>Back to Clients</span>
              </button>
{/* Voice Command Mic Button — Push-to-Talk */}
               <button
                 onMouseDown={() => startRecording()}
                 onMouseUp={() => stopListeningAndProcess()}
                 onMouseLeave={() => {
                   // Guard: if the user drags off the button mid-press, abort instead of letting the press hang
                   if (isRecording) abortRecording();
                 }}
                 onTouchStart={(e) => { e.preventDefault(); triggerHapticFeedback(); startRecording(); }}
                 onTouchEnd={(e) => { e.preventDefault(); stopListeningAndProcess(); }}
                 onTouchCancel={() => abortRecording()}
                 className={`relative p-3 rounded-full transition-all touch-none select-none active:scale-95 duration-75 ${
                  isRecording
                    ? 'bg-red-600 animate-pulse shadow-lg shadow-red-500/50 ring-2 ring-red-400'
                    : isProcessing
                      ? 'bg-amber-500 animate-pulse shadow-lg shadow-amber-500/50'
                      : 'bg-[#0097b2] hover:bg-[#0086a3]'
                }`}
                title={
                  isRecording
                    ? 'Release to send'
                    : isProcessing
                      ? 'Processing your command...'
                      : 'Hold to talk (Push-to-Talk)'
                }
              >
                <svg
                  className="w-5 h-5 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  {isRecording ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 011 1h-4a1 1 0 01-1-1v-4z" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  )}
                </svg>
                {/* Recording indicator ring */}
                {isRecording && (
                  <span className="absolute inset-0 rounded-full animate-ping bg-red-400 opacity-30" />
                )}
              </button>

              {/* Hannah Sleep/Wake Indicator */}
              {!isHannahAwake && (
                <div className="flex items-center gap-2 px-3 py-1 bg-gray-600/20 border border-gray-500/30 rounded-full">
                  <div className="w-2 h-2 bg-gray-400 rounded-full" />
                  <span className="text-xs text-gray-400">Hannah sleeping</span>
                </div>
              )}
            </div>
          </div>

          {/* Client Switcher Dropdown */}
          <div className="flex items-center gap-3">
            <label className="text-xs text-white/60 uppercase tracking-wider">Select Client:</label>
            <select
              value={clientId}
              onChange={(e) => onClientChange(e.target.value)}
              className="flex-1 bg-black/30 border border-white/20 rounded px-3 py-2 text-sm text-white focus:border-[#0097b2] outline-none"
            >
              {Array.isArray(clients) ? (
                clients.map((client, index) => {
                  if (!client) return null;
                  const stableKey = client?.id ?? `client-fallback-${index}`;
                  return (
                    <option key={stableKey} value={client?.id ?? ''}>
                      {client?.name ?? 'Unknown Client'}
                    </option>
                  );
                })
              ) : (
                <option disabled value="">Loading clients...</option>
              )}
            </select>
          </div>
        </div>

        <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-xl p-6">

          <BackgroundControlsPanel
            title="Header Background"
            type={config.headerBackgroundType}
            onTypeChange={(type) => updateConfig('headerBackgroundType', type)}
            solidColor={config.headerBackground}
            onSolidColorChange={(color) => updateConfig('headerBackground', color)}
            gradientStart={config.headerGradientStart}
            onGradientStartChange={(color) => updateConfig('headerGradientStart', color)}
            gradientEnd={config.headerGradientEnd}
            onGradientEndChange={(color) => updateConfig('headerGradientEnd', color)}
            imageUrl={config.headerImage}
            onImageUrlChange={(url) => updateConfig('headerImage', url)}
            imagePlaceholder="https://example.com/header-image.jpg"
            opacity={config.headerOpacity}
            onOpacityChange={(value) => updateConfig('headerOpacity', value)}
          />

          {/* Footer Background */}
          <BackgroundControlsPanel
            title="Footer Background"
            type={config.footerBackgroundType}
            onTypeChange={(type) => updateConfig('footerBackgroundType', type)}
            solidColor={config.footerBackground}
            onSolidColorChange={(color) => updateConfig('footerBackground', color)}
            solidPlaceholder="#050a14"
            gradientStart={config.footerGradientStart}
            onGradientStartChange={(color) => updateConfig('footerGradientStart', color)}
            gradientEnd={config.footerGradientEnd}
            onGradientEndChange={(color) => updateConfig('footerGradientEnd', color)}
            imageUrl={config.footerImage}
            onImageUrlChange={(url) => updateConfig('footerImage', url)}
            imagePlaceholder="https://example.com/footer-image.jpg"
            opacity={config.footerOpacity}
            onOpacityChange={(value) => updateConfig('footerOpacity', value)}
          />

          {/* ── WIDGET BACKGROUND CARD ─────────────────────────────── */}
          {/* Positioned between Footer Background and Logo to mirror the
              stacked-card hierarchy of Header/Footer/Widget/Logo. */}
          <BackgroundControlsPanel
            title="Widget Background"
            type={config.widgetBodyBackgroundType}
            onTypeChange={(type) => updateConfig('widgetBodyBackgroundType', type)}
            solidColor={config.widgetBodyBackground}
            onSolidColorChange={(color) =>
              handleThemeUpdateEngine({
                widgetBodyBackground: color,
                widgetBodyOpacity: config.widgetBodyOpacity,
              })
            }
            solidPlaceholder="#1f2937"
            gradientStart={config.widgetBodyGradientStart}
            onGradientStartChange={(color) =>
              handleThemeUpdateEngine({
                widgetBodyGradientStart: color,
                widgetBodyGradientEnd: config.widgetBodyGradientEnd,
                widgetBodyOpacity: config.widgetBodyOpacity,
              })
            }
            gradientEnd={config.widgetBodyGradientEnd}
            onGradientEndChange={(color) =>
              handleThemeUpdateEngine({
                widgetBodyGradientEnd: color,
                widgetBodyGradientStart: config.widgetBodyGradientStart,
                widgetBodyOpacity: config.widgetBodyOpacity,
              })
            }
            imageUrl={config.widgetBodyImage}
            onImageUrlChange={(url) =>
              handleThemeUpdateEngine({
                widgetBodyImage: url,
                widgetBodyOpacity: config.widgetBodyOpacity,
              })
            }
            imagePlaceholder="https://example.com/widget-bg.jpg"
            opacity={config.widgetBodyOpacity}
            onOpacityChange={(value) =>
              handleThemeUpdateEngine({
                widgetBodyOpacity: value,
                ...(config.widgetBodyBackgroundType === 'gradient'
                  ? { widgetBodyGradientStart: config.widgetBodyGradientStart, widgetBodyGradientEnd: config.widgetBodyGradientEnd }
                  : { widgetBodyImage: config.widgetBodyImage }),
              })
            }
            opacityLabel="Window Opacity"
          />

          {/* Logo Upload */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-white/80 uppercase tracking-wider">Logo</h3>
            <div className="flex items-center gap-3">
              <input
                type="text"
                value={config.logoUrl}
                onChange={(e) => updateConfig('logoUrl', e.target.value)}
                className="flex-1 bg-black/30 border border-white/20 rounded px-3 py-2 text-xs text-white focus:border-[#0097b2] outline-none"
                placeholder="Logo URL"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-xs rounded transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isUploading ? 'Uploading...' : 'Upload'}
              </button>
              <input
                type="file"
                accept="image/*"
                ref={fileInputRef}
                onChange={handleFileChange}
                className="hidden"
              />
            </div>
          </div>

          {/* Widget Title / Company Name */}
          <div className="space-y-2">
            <label className="text-xs text-white/60 uppercase tracking-wider">Widget Title Text</label>
            <input
              type="text"
              value={config.brandName}
              onChange={(e) => updateConfig('brandName', e.target.value)}
              className="w-full bg-black/30 border border-white/20 rounded px-3 py-2 text-xs text-white focus:border-[#0097b2] outline-none"
              placeholder="Omniverge Global"
            />
          </div>
        </div>

        {/* The Switchboard */}
        <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-xl p-6">
          <h2 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
            <span className="text-[#FFD700]">◆</span>
            AI Add-ons
          </h2>

          <div className="space-y-4">
            {/* AI Insight Badge */}
            <div className="flex items-center justify-between p-3 bg-black/20 rounded-lg">
              <div className="flex items-center gap-3">
                {isFeatureLocked('aiInsightBadge') && (
                  <span className="text-[#FFD700] text-lg">🔒</span>
                )}
                <div>
                  <div className="text-sm text-white font-medium">AI Insight Badge</div>
                  <div className="text-xs text-white/50">Display AI-powered insights</div>
                </div>
              </div>
              <button
                onClick={() => updateConfig('aiInsightBadge', !config.aiInsightBadge)}
                disabled={isFeatureLocked('aiInsightBadge')}
                className={`w-12 h-6 rounded-full transition-all relative ${
                  config.aiInsightBadge ? 'bg-[#0097b2]' : 'bg-white/20'
                } ${isFeatureLocked('aiInsightBadge') ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
              >
                <div
                  className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${
                    config.aiInsightBadge ? 'left-7' : 'left-1'
                  }`}
                />
              </button>
            </div>

            {/* AI Design Mirror */}
            <div className="flex items-center justify-between p-3 bg-black/20 rounded-lg">
              <div className="flex items-center gap-3">
                {isFeatureLocked('aiDesignMirror') && (
                  <span className="text-[#FFD700] text-lg">🔒</span>
                )}
                <div>
                  <div className="text-sm text-white font-medium">AI Design Mirror</div>
                  <div className="text-xs text-white/50">Auto-scrape and mirror design</div>
                </div>
              </div>
              <button
                onClick={() => updateConfig('aiDesignMirror', !config.aiDesignMirror)}
                disabled={isFeatureLocked('aiDesignMirror')}
                className={`w-12 h-6 rounded-full transition-all relative ${
                  config.aiDesignMirror ? 'bg-[#0097b2]' : 'bg-white/20'
                } ${isFeatureLocked('aiDesignMirror') ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
              >
                <div
                  className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${
                    config.aiDesignMirror ? 'left-7' : 'left-1'
                  }`}
                />
              </button>
            </div>

            {/* Custom CSS */}
            <div className="flex items-center justify-between p-3 bg-black/20 rounded-lg">
              <div className="flex items-center gap-3">
                {isFeatureLocked('customCss') && (
                  <span className="text-[#FFD700] text-lg">🔒</span>
                )}
                <div>
                  <div className="text-sm text-white font-medium">Custom CSS</div>
                  <div className="text-xs text-white/50">Inject custom styles</div>
                </div>
              </div>
              <button
                onClick={() => updateConfig('customCss', !config.customCss)}
                disabled={isFeatureLocked('customCss')}
                className={`w-12 h-6 rounded-full transition-all relative ${
                  config.customCss ? 'bg-[#0097b2]' : 'bg-white/20'
                } ${isFeatureLocked('customCss') ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
              >
                <div
                  className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${
                    config.customCss ? 'left-7' : 'left-1'
                  }`}
                />
              </button>
            </div>
            {config.customCss && (
              <div className="animate-in fade-in slide-in-from-top-2 duration-200 mt-3">
                <label className="text-[10px] font-bold uppercase tracking-wider text-cyan-400 block mb-1.5 font-mono">
                  CSS Sandbox Overrides
                </label>
                <textarea
                  value={config.customCssCode || ''}
                  onChange={(e) => updateConfig('customCssCode', e.target.value)}
                  placeholder={`.widget-container {\n  border-radius: 16px;\n  backdrop-filter: blur(12px);\n}`}
                  className="w-full h-32 font-mono text-xs bg-slate-950/90 text-emerald-400 rounded-md p-3 border border-white/10 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-none resize-none"
                  spellCheck={false}
                />
              </div>
            )}
          </div>

          {isFeatureLocked('standard') && (
            <div className="mt-4 p-3 bg-[#FFD700]/10 border border-[#FFD700]/30 rounded-lg">
              <div className="flex items-center gap-2 text-[#FFD700] text-xs">
                <span>🔒</span>
                <span>Upgrade to Premium to unlock all AI features</span>
              </div>
            </div>
          )}
        </div>

      {/* Voice & Agent Configuration */}
      <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-xl p-6">
        <h2 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
          <span className="text-[#FFD700]">◆</span>
          Voice &amp; Agent
        </h2>

        <div className="space-y-4">
          {/* Voice Features Enabled */}
          <div className="flex items-center justify-between p-3 bg-black/20 rounded-lg">
            <div className="flex items-center gap-3">
              <div>
                <div className="text-sm text-white font-medium">Voice Features Enabled</div>
                <div className="text-xs text-white/50">Show the mic button in the client chat widget</div>
              </div>
            </div>
            <button
              onClick={() => updateConfig('voiceFeaturesEnabled', !config.voiceFeaturesEnabled)}
              className={`w-12 h-6 rounded-full transition-all relative ${
                config.voiceFeaturesEnabled ? 'bg-[#0097b2]' : 'bg-white/20'
              } cursor-pointer`}
            >
              <div
                className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${
                  config.voiceFeaturesEnabled ? 'left-7' : 'left-1'
                }`}
              />
            </button>
          </div>

          {/* Local Fallback Alert */}
          <div className="flex items-center justify-between p-3 bg-black/20 rounded-lg">
            <div className="flex items-center gap-3">
              <div>
                <div className="text-sm text-white font-medium">Local Fallback Alert</div>
                <div className="text-xs text-white/50">Notify client when falling back to browser-native STT</div>
              </div>
            </div>
            <button
              onClick={() => updateConfig('localFallbackAlert', !config.localFallbackAlert)}
              className={`w-12 h-6 rounded-full transition-all relative ${
                config.localFallbackAlert ? 'bg-[#0097b2]' : 'bg-white/20'
              } cursor-pointer`}
            >
              <div
                className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${
                  config.localFallbackAlert ? 'left-7' : 'left-1'
                }`}
              />
            </button>
          </div>

          {/* Default TTS Voice Selector */}
          <div className="p-3 bg-black/20 rounded-lg">
            <label className="text-sm text-white font-medium block mb-1">
              Default TTS Voice
            </label>
            <p className="text-xs text-white/50 mb-3">
              Reseller default used by the unified speech endpoint for this client.
            </p>
            <select
              value={config.defaultTtsVoice}
              onChange={(e) => updateConfig('defaultTtsVoice', e.target.value)}
              className="w-full bg-black/30 border border-white/20 rounded px-3 py-2 text-sm text-white focus:border-[#0097b2] outline-none"
            >
              {TTS_VOICE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

        {/* AI Vibe Generator */}
        <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-xl p-6">
          <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <span className="text-[#FFD700]">✨</span>
            AI Vibe Generator
          </h2>
          <p className="text-white/60 text-sm mb-4">
            Describe your desired aesthetic and let AI generate the perfect branding.
          </p>
          <div className="space-y-3">
            <div className="flex gap-2">
              <input
                type="text"
                value={vibeInput}
                onChange={(e) => setVibeInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && vibeInput && applyAIVibe(vibeInput)}
                placeholder="e.g., 'cyberpunk neon', 'minimalist luxury', 'playful and bright'"
                className="flex-1 bg-black/30 border border-white/20 rounded-lg px-4 py-3 text-sm text-white focus:border-[#FFD700] outline-none"
                disabled={isAiSyncing}
              />
              <button
                onClick={() => vibeInput && applyAIVibe(vibeInput)}
                disabled={isAiSyncing || !vibeInput}
                className="px-6 py-3 bg-gradient-to-r from-[#FFD700] to-[#FFA500] hover:from-[#FFC700] hover:to-[#FF9500] text-black font-semibold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isAiSyncing ? 'Generating...' : 'Apply Vibe'}
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {['Cyberpunk Neon', 'Minimalist', 'Luxury Gold', 'Ocean Blue', 'Sunset Warmth', 'Forest Green'].map((vibe) => (
                <button
                  key={vibe}
                  onClick={() => applyAIVibe(vibe)}
                  disabled={isAiSyncing}
                  className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white/80 text-xs rounded-full transition-all disabled:opacity-50"
                >
                  {vibe}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Quick Action Pills — Reseller override path */}
        <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <span className="text-[#FFD700]">◆</span>
                Quick Action Pills
              </h2>
              <p className="text-white/50 text-xs mt-1">
                Manage the suggested action pills shown in this client&apos;s widget.
              </p>
            </div>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <span className="text-xs text-white/70">Unlock Client Configuration Management (Edit on Behalf)</span>
              <input
                type="checkbox"
                checked={isAdminOverrideActive}
                onChange={(e) => setIsAdminOverrideActive(e.target.checked)}
                className="w-4 h-4 accent-[#0097b2]"
                aria-label="Unlock client configuration management"
              />
            </label>
          </div>
          <SuggestedActionsEditor
            value={suggestedActions}
            onChange={setSuggestedActions}
            isReadOnly={!isAdminOverrideActive}
          />
        </div>

        {/* Save Button */}
        <div className="flex items-center gap-4">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-6 py-3 bg-[#0097b2] hover:bg-[#0086a3] text-white font-semibold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? 'Saving...' : 'Save Configuration'}
          </button>
          <button
            onClick={syncBrandWithURL}
            disabled={isAiSyncing}
            className="px-6 py-3 bg-gradient-to-r from-[#FFD700] to-[#FFA500] hover:from-[#FFC700] hover:to-[#FF9500] text-black font-semibold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <span>{isAiSyncing ? '✨ Syncing...' : '✨ AI Magic'}</span>
          </button>
          {saveMessage && (
            <span className={`text-sm ${saveMessage.includes('Error') ? 'text-red-400' : 'text-green-400'}`}>
              {saveMessage}
            </span>
          )}
        </div>

        {/* Voice-Visual Harmony - Greeting Preview */}
        {showGreetingPreview && (
          <div className="backdrop-blur-xl bg-white/10 border border-[#FFD700]/30 rounded-xl p-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <span className="text-[#FFD700]">◆</span>
                  Voice-Visual Harmony
                </h3>
                <button
                  onClick={() => setShowGreetingPreview(false)}
                  className="text-white/60 hover:text-white text-sm"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-3">
                <div className="text-white/80 text-sm">
                  <span className="text-[#FFD700]">Generated Greeting:</span>
                </div>
                <div className="backdrop-blur-lg bg-black/40 rounded-lg p-4 border border-white/10">
                  <p className="text-white text-sm italic">{'\u201C'}{generatedGreeting}{'\u201D'}</p>
                </div>

                {greetingExplanation && (
                  <div className="text-white/60 text-xs">
                    <span className="text-[#FFD700]">Design Rationale:</span> {greetingExplanation}
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={instantSave}
                    disabled={isSaving}
                    className="flex-1 px-4 py-2 bg-gradient-to-r from-[#FFD700] to-[#FFA500] hover:from-[#FFC700] hover:to-[#FF9500] text-black font-semibold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                  >
                    {isSaving ? 'Saving...' : 'I love it! ✓'}
                  </button>
                  <button
                    onClick={() => {
                      setShowGreetingPreview(false);
                      tts('No problem. Let me generate a different greeting for you.');
                      setTimeout(() => generateHarmoniousGreeting(), 2000);
                    }}
                    className="flex-1 px-4 py-2 bg-white/10 hover:bg-white/20 text-white font-medium rounded-lg transition-all text-sm"
                  >
                    Try Again
                  </button>
                </div>

                <div className="text-white/40 text-xs text-center">
                  Say {'\u201C'}I love it{'\u201D'} or {'\u201C'}Save that{'\u201D'} to approve, or {'\u201C'}Try again{'\u201D'} to regenerate
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Long-Form STT Mode Indicator */}
        {isLongFormSTT && (
          <div className="backdrop-blur-xl bg-red-500/20 border border-red-500/30 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
              <div className="text-white">
                <div className="font-semibold text-sm">🎤 Dictating Greeting</div>
                <div className="text-xs text-white/70">Say {'\u201C'}stop{'\u201D'} or {'\u201C'}done{'\u201D'} when finished</div>
                {dictatedGreeting && (
                  <div className="mt-2 text-xs text-white/60 italic">
                    {'\u201C'}{dictatedGreeting}{'\u201D'}
                  </div>
                )}
              </div>
              <button
                onClick={stopLongFormSTT}
                className="ml-auto px-3 py-1 bg-red-500 hover:bg-red-600 text-white text-xs rounded-full transition-all"
              >
                Stop
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Right Panel: Live Preview */}
      <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-xl p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <span className="text-[#FFD700]">◆</span>
            Live Preview
          </h2>
          {/* Speaker Toggle */}
          <button
            onClick={() => setIsSpeakerEnabled(!isSpeakerEnabled)}
            className={`p-2 rounded-lg transition-all ${
              isSpeakerEnabled
                ? 'bg-[#0097b2]/20 text-[#0097b2]'
                : 'bg-white/10 text-white/40'
            }`}
            title={isSpeakerEnabled ? 'Mute Hannah' : 'Unmute Hannah'}
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              {isSpeakerEnabled ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z M16 12l6-6m0 0l-6 6m6-6l6 6" />
              )}
            </svg>
          </button>
        </div>

        <div className="relative rounded-lg overflow-hidden h-[440px]">
          <ChatWidget
            tenantId=""
            branding={canonicalBranding}
            preview
            liveDraft={{
              brandName: config.brandName,
              personaMode: 'sales',
              systemPrompt: '',
            }}
            greeting={generatedGreeting}
            suggestedActions={suggestedActions}
            voiceFeaturesEnabled={config.voiceFeaturesEnabled}
            features={{
              voiceFeaturesEnabled: config.voiceFeaturesEnabled,
              customCss: config.customCss,
              aiInsightBadge: config.aiInsightBadge,
              aiDesignMirror: config.aiDesignMirror,
              localFallbackAlert: config.localFallbackAlert,
            }}
          />
        </div>

        {/* Guided Onboarding Overlay */}
        {showGuidedSetup && (
          <div className="absolute inset-0 backdrop-blur-xl bg-black/80 flex items-center justify-center z-50">
            <div className="backdrop-blur-xl bg-white/10 border border-[#FFD700]/30 rounded-2xl p-8 max-w-md w-full mx-4">
              <div className="text-center space-y-6">
                <div className="flex justify-center">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-r from-[#FFD700] to-[#FFA500] flex items-center justify-center">
                    <svg className="w-8 h-8 text-black" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                    </svg>
                  </div>
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white mb-2">AI Branding Suggestion</h3>
                  <p className="text-white/80 text-sm">
                     I&apos;ve prepared a professional branding theme for your client. Would you like to apply it?
                  </p>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={applySuggestedConfig}
                    className="flex-1 px-6 py-3 bg-gradient-to-r from-[#FFD700] to-[#FFA500] hover:from-[#FFC700] hover:to-[#FF9500] text-black font-semibold rounded-lg transition-all"
                  >
                    Confirm
                  </button>
                  <button
                    onClick={openClientSelector}
                    className="flex-1 px-6 py-3 border border-slate-700 bg-slate-900/50 hover:bg-slate-800 text-slate-300 font-semibold rounded-lg transition-colors shadow-sm"
                  >
                    Another Client
                  </button>
                </div>
                <button
                  onClick={() => setShowGuidedSetup(false)}
                  className="w-full px-4 py-2 text-white/60 hover:text-white text-sm transition-colors"
                >
                  Skip for now
                </button>
              </div>
            </div>
          </div>
        )}

        {/* System Command Console (SST) — anchored at the base of the Live Preview panel */}
        <div className="mt-4 pt-4 border-t border-white/10">
          <label className="block text-[10px] font-semibold uppercase tracking-wider text-white/40 mb-2">
            System Command Console
          </label>
          <div className="flex items-center border border-white/10 bg-white/5 rounded-lg px-3 py-2 focus-within:border-[#0097b2]/50 transition-colors">
            <input
              type="text"
              value={textCommand}
              onChange={(e) => {
                userHasTypedRef.current = true;
                setTextCommand(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  e.stopPropagation();
                  handleTextCommand(textCommand);
                }
              }}
              placeholder="Type a command or speak — e.g. 'what can you do?'"
              disabled={isProcessingText}
              className="flex-1 bg-transparent text-xs text-white placeholder-white/40 outline-none disabled:opacity-50"
            />
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleTextCommand(textCommand);
              }}
              disabled={isProcessingText || !textCommand.trim()}
              className="ml-2 flex-shrink-0 p-1 rounded hover:bg-white/10 transition-colors disabled:opacity-30"
              aria-label="Send command"
            >
              {isProcessingText ? (
                <svg className="h-3.5 w-3.5 text-[#0097b2] animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <svg className="h-3.5 w-3.5 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9-2-9-18-9 18 9 2zm0 0v-8" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Transcribing Overlay */}
        {(isRecording || isProcessing || voiceTranscript) && (
          <div className="absolute bottom-4 left-4 right-4 backdrop-blur-xl bg-black/60 border border-[#FFD700]/30 rounded-xl p-4 z-50">
            <div className="flex items-center gap-3">
              {isRecording && (
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-white/80 text-sm font-medium">
                    {showGuidedSetup ? 'Listening for your response...' : 'Listening...'}
                  </span>
                </div>
              )}
              {isProcessing && (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-[#0097b2] border-t-transparent rounded-full animate-spin" />
                  <span className="text-white/80 text-sm font-medium">Processing...</span>
                </div>
              )}
            </div>
            {voiceTranscript && (
              <div className="mt-2 text-slate-100 text-sm font-medium overflow-hidden text-ellipsis whitespace-nowrap max-w-full">
                <span className="text-[#FFD700] opacity-90">You said:</span> {'\u201C'}{voiceTranscript}{'\u201D'}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}