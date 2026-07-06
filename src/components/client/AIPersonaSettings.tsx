"use client";

import { useState, useCallback, useEffect } from "react";
import { Loader2, Save, Settings2 } from "lucide-react";
import type { WidgetConfig } from "@/lib/schemas/tenant-config.schema";
import type { CanonicalAIPersona } from "@/lib/schemas/tenant-config.canonical";
import { createClient } from "@/lib/supabase/client";
import { resolveTenantId } from "@/lib/resolveTenantId";

// ────────────────────────────────────────────────────────────────────
// Persona Form State Interface
// ────────────────────────────────────────────────────────────────────
interface PersonaFormState {
  name: string;
  voiceId: string;
  personality: "friendly" | "direct" | "professional";
  conversationStyle: string;
  actionCapabilities?: {
    canExecute?: boolean;
    canAccessAnalytics?: boolean;
    canModifyConfig?: boolean;
  };
}

// Default form values
const DEFAULT_PERSONA: PersonaFormState = {
  name: "",
  voiceId: "",
  personality: "professional",
  conversationStyle: "",
  actionCapabilities: undefined,
};

// Available voice options (extend as needed)
const VOICE_OPTIONS = [
  { value: "21m00Tcm4TlvDq8ikWAM", label: "Rachel (Female, American)" },
  { value: "AZnzlk1XvdvUeBnXmlld", label: "Domi (Female, American)" },
  { value: "EXAVITQu4vr4xnSDxMaL", label: "Bella (Female, American)" },
  { value: "ErXwobaYiN019PkySvjV", label: "Antoni (Male, American)" },
  { value: "MF3mGyEYCl7XYWbV9V6O", label: "Elli (Female, American)" },
  { value: "TxGEqnHWrfWFTfGW9XjX", label: "Josh (Male, American)" },
  { value: "wqV5fIrwit7AaCuRgyont", label: "Arnold (Male, British)" },
];

const PERSONALITY_OPTIONS = [
  { value: "friendly", label: "Friendly" },
  { value: "direct", label: "Direct" },
  { value: "professional", label: "Professional" },
];

// ────────────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────────────
export default function AIPersonaSettings() {
  const [formState, setFormState] = useState<PersonaFormState>(DEFAULT_PERSONA);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Load existing config on mount
  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    async function load() {
      setIsLoading(true);
      setError(null);

      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          throw new Error("Unauthenticated");
        }

        // Resolve the tenant for this user via resolveTenantId (user_resellers → tenants)
        const { data: resolvedTenantId, error: tenantIdErr } = await resolveTenantId(user.id);
        if (tenantIdErr || !resolvedTenantId) {
          throw new Error(tenantIdErr?.message || "No tenant association found");
        }
        setTenantId(resolvedTenantId);

        const { data, error: fetchErr } = await supabase
          .from("tenants")
          .select("widget_config")
          .eq("id", resolvedTenantId)
          .single();

        if (fetchErr || !data?.widget_config) {
          // keep defaults if none exists
          if (!cancelled) setFormState(DEFAULT_PERSONA);
          return;
        }

        const config = data.widget_config as WidgetConfig;
        const persona = config.ai_settings
          ? {
              name: config.ai_settings.name ?? "",
              voiceId: config.ai_settings.voiceId ?? "",
              personality: config.ai_settings.personality ?? "professional",
              conversationStyle: typeof config.ai_settings.conversationStyle === "string" ? config.ai_settings.conversationStyle : "",
              actionCapabilities:
                typeof config.ai_settings.conversationStyle === "object" &&
                config.ai_settings.conversationStyle !== null &&
                "actionCapabilities" in config.ai_settings.conversationStyle
                  ? (config.ai_settings.conversationStyle as Record<string, unknown>).actionCapabilities as PersonaFormState["actionCapabilities"]
                  : undefined,
            }
          : DEFAULT_PERSONA;

        if (!cancelled) setFormState(persona);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!cancelled) setError(msg);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  // Derive studioConfig payload for API
  const buildStudioConfigPayload = useCallback(
    (persona: PersonaFormState): { aiPersona: Partial<CanonicalAIPersona> } => {
      return {
        aiPersona: {
          name: persona.name,
          voiceId: persona.voiceId,
          personality: persona.personality,
          conversationStyle: persona.conversationStyle
            ? {
                text: persona.conversationStyle,
                actionCapabilities: persona.actionCapabilities,
              }
            : undefined,
        },
      };
    },
    []
  );

  // ────────────────────────────────────────────────────────────────────
  // Form Field Updaters (useCallback on each setter for strict deps)
  // ────────────────────────────────────────────────────────────────────
  const updateName = useCallback((value: string) => {
    setFormState((prev) => ({ ...prev, name: value }));
  }, []);

  const updateVoiceId = useCallback((value: string) => {
    setFormState((prev) => ({ ...prev, voiceId: value }));
  }, []);

  const updatePersonality = useCallback(
    (value: "friendly" | "direct" | "professional") => {
      setFormState((prev) => ({ ...prev, personality: value }));
    },
    []
  );

  const updateConversationStyle = useCallback((value: string) => {
    setFormState((prev) => ({ ...prev, conversationStyle: value }));
  }, []);

  const updateActionCapability = useCallback(<K extends keyof NonNullable<PersonaFormState["actionCapabilities"]>>(key: K, value: boolean) => {
    setFormState((prev) => ({
      ...prev,
      actionCapabilities: {
        ...prev.actionCapabilities,
        [key]: value,
      },
    }));
  }, []);

  // ────────────────────────────────────────────────────────────────────
  // Save Handler
  // ────────────────────────────────────────────────────────────────────
  const handleSave = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setIsSaving(true);
      setError(null);
      setSuccessMessage(null);

      try {
        const studioConfig = buildStudioConfigPayload(formState);
        const response = await fetch("/api/client/update-studio-config", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            tenantId: tenantId,
            studioConfig,
          }),
        });

        if (!response.ok) {
          let errorMessage = `Failed to save (${response.status})`;
          try {
            const errBody = await response.json();
            if (errBody.error) errorMessage = errBody.error;
          } catch {
            // ignore parse errors
          }
          throw new Error(errorMessage);
        }

        setSuccessMessage("AI Persona updated successfully");
      } catch (err) {
        setError(err instanceof Error ? err.message : "An unexpected error occurred.");
      } finally {
        setIsSaving(false);
      }
    },
    [formState, buildStudioConfigPayload, tenantId]
  );

  // ────────────────────────────────────────────────────────────────────
  // Loading / Empty States
  // ────────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="w-full max-w-2xl mx-auto bg-slate-950/15 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-2xl">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 text-cyan-400 animate-spin" />
          <span className="ml-2 text-sm text-zinc-400">Loading configuration...</span>
        </div>
      </div>
    );
  }

  // ────────────────────────────────────────────────────────────────────
  // Render
  // ────────────────────────────────────────────────────────────────────
  return (
    <div className="w-full max-w-2xl mx-auto bg-slate-950/15 backdrop-blur-xl border border-white/10 shadow-[0_0_50px_rgba(0,229,255,0.1)] rounded-2xl p-6 shadow-2xl relative overflow-hidden font-agrandir">
      {/* Top Indicator */}
      <div className="mb-5 border-b border-cyan-950/60 pb-3">
        <span className="text-[10px] font-mono text-cyan-400 tracking-widest">
          AI Persona Configuration
        </span>
      </div>

      {/* Header */}
      <div className="flex items-center gap-2 mb-6">
        <Settings2 className="w-5 h-5 text-cyan-400" />
        <div>
          <h2 className="font-agrandir font-black text-lg text-white tracking-wide">
            AI Assistant Settings
          </h2>
          <p className="text-zinc-400 text-xs">
            Configure your AI persona, voice, and interaction style
          </p>
        </div>
      </div>

      {/* Error / Success Messages */}
      {error && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
          <p className="text-red-400 text-xs">{error}</p>
        </div>
      )}

      {successMessage && (
        <div className="mb-4 p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
          <p className="text-green-400 text-xs">{successMessage}</p>
        </div>
      )}

      {/* Persona Form */}
      <form onSubmit={handleSave} className="space-y-5">
        {/* Conversation Style */}
        <div className="space-y-1">
          <label className="block text-[9px] font-bold text-slate-500 tracking-widest uppercase ml-0.5">
            Conversation Style
          </label>
          <textarea
            value={formState.conversationStyle}
            onChange={(e) => updateConversationStyle(e.target.value)}
            rows={4}
            placeholder="Describe how the AI should converse with users..."
            className="w-full bg-slate-900/50 border border-slate-800/80 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-all resize-y"
          />
          <p className="text-[10px] text-slate-500 mt-0.5">
            Guidelines that shape how the AI responds to user messages
          </p>
        </div>

        {/* Operational Permissions */}
        <div className="rounded-xl border border-white/10 bg-slate-900/40 p-4">
          <p className="text-xs font-semibold text-white mb-3">AI Operational Permissions</p>
          <div className="space-y-2">
            <label className="flex items-center justify-between">
              <span className="text-[10px] text-zinc-400">Allow AI to execute actions</span>
              <input
                type="checkbox"
                checked={!!formState.actionCapabilities?.canExecute}
                onChange={(e) => updateActionCapability("canExecute", e.target.checked)}
                className="w-4 h-4 rounded border-white/20 bg-slate-900 accent-cyan-500"
              />
            </label>
            <label className="flex items-center justify-between">
              <span className="text-[10px] text-zinc-400">Allow AI to access analytics</span>
              <input
                type="checkbox"
                checked={!!formState.actionCapabilities?.canAccessAnalytics}
                onChange={(e) => updateActionCapability("canAccessAnalytics", e.target.checked)}
                className="w-4 h-4 rounded border-white/20 bg-slate-900 accent-cyan-500"
              />
            </label>
            <label className="flex items-center justify-between">
              <span className="text-[10px] text-zinc-400">Allow AI to modify configuration</span>
              <input
                type="checkbox"
                checked={!!formState.actionCapabilities?.canModifyConfig}
                onChange={(e) => updateActionCapability("canModifyConfig", e.target.checked)}
                className="w-4 h-4 rounded border-white/20 bg-slate-900 accent-cyan-500"
              />
            </label>
          </div>
          <p className="text-[10px] text-slate-500 mt-2">
            These permissions control what operational commands the AI may perform on behalf of this tenant.
          </p>
        </div>
        <div className="space-y-1">
          <label className="block text-[9px] font-bold text-slate-500 tracking-widest uppercase ml-0.5">
            Persona Name
          </label>
          <input
            type="text"
            value={formState.name}
            onChange={(e) => updateName(e.target.value)}
            placeholder="e.g., Zeeder, Hannah, Alex"
            className="w-full bg-slate-900/50 border border-slate-800/80 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-all"
          />
          <p className="text-[10px] text-slate-500 mt-0.5">
            The display name for your AI assistant
          </p>
        </div>

        {/* VoiceId Dropdown */}
        <div className="space-y-1">
          <label className="block text-[9px] font-bold text-slate-500 tracking-widest uppercase ml-0.5">
            Voice
          </label>
          <select
            value={formState.voiceId}
            onChange={(e) => updateVoiceId(e.target.value)}
            className="w-full bg-slate-900/50 border border-slate-800/80 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-all"
          >
            <option value="">Select a voice...</option>
            {VOICE_OPTIONS.map((voice) => (
              <option key={voice.value} value={voice.value}>
                {voice.label}
              </option>
            ))}
          </select>
          <p className="text-[10px] text-slate-500 mt-0.5">
            Select the voice for your AI assistant
          </p>
        </div>

        {/* Personality Dropdown */}
        <div className="space-y-1">
          <label className="block text-[9px] font-bold text-slate-500 tracking-widest uppercase ml-0.5">
            Personality
          </label>
          <select
            value={formState.personality}
            onChange={(e) =>
              updatePersonality(e.target.value as "friendly" | "direct" | "professional")
            }
            className="w-full bg-slate-900/50 border border-slate-800/80 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-all"
          >
            {PERSONALITY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <p className="text-[10px] text-slate-500 mt-0.5">
            Define the interaction tone of your AI
          </p>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={isSaving}
          className="w-full bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white font-semibold text-xs py-2.5 rounded-lg mt-2 shadow-lg shadow-cyan-500/10 hover:shadow-cyan-500/20 transition-all duration-300 disabled:opacity-50 disabled:pointer-events-none inline-flex items-center justify-center gap-2"
        >
          {isSaving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Saving...</span>
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              <span>Update Persona</span>
            </>
          )}
        </button>
      </form>
    </div>
  );
}
