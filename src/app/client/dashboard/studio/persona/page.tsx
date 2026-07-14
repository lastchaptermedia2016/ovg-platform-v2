'use client';

import { useState, useCallback, useEffect } from 'react';
import { createClient as createSupabaseClient } from '@/lib/supabase/client';
import { resolveTenantId } from '@/lib/resolveTenantId';
import { useStudioDraft, toCanonicalAIPersona } from '@/contexts/StudioDraftContext';
import type { CanonicalAIPersona } from '@/lib/schemas/tenant-config.canonical';

interface Feedback {
  type: 'success' | 'error';
  message: string;
}

const PERSONA_MODES = [
  { value: 'sales', label: 'Sales' },
  { value: 'concierge', label: 'Concierge' },
] as const;

const VOICE_OPTIONS = [
  { value: '21m00Tcm4TlvDq8ikWAM', label: 'Rachel (Female, American)' },
  { value: 'AZnzlk1XvdvUeBnXmlld', label: 'Domi (Female, American)' },
  { value: 'EXAVITQu4vr4xnSDxMaL', label: 'Bella (Female, American)' },
  { value: 'ErXwobaYiN019PkySvjV', label: 'Antoni (Male, American)' },
  { value: 'MF3mGyEYCl7XYWbV9V6O', label: 'Elli (Female, American)' },
  { value: 'TxGEqnHWrfWFTfGW9XjX', label: 'Josh (Male, American)' },
  { value: 'wqV5fIrwit7AaCuRgyont', label: 'Arnold (Male, British)' },
];

const SALES_SYSTEM_PROMPT = `You are a sales-focused AI assistant. Your primary goal is to qualify leads, understand customer needs, and guide them toward a purchase decision. Be persuasive yet professional. Ask discovery questions to identify pain points, present relevant solutions, and create urgency when appropriate. Always maintain a helpful tone while driving toward conversion.`;

const CONCIERGE_SYSTEM_PROMPT = `You are a concierge-style AI assistant. Your primary goal is to provide exceptional hospitality and personalized service. Anticipate needs, offer thoughtful recommendations, and ensure every interaction feels premium and caring. Prioritize customer comfort and satisfaction. Be attentive to details and proactive in offering assistance.`;

const DEFAULT_SYSTEM_PROMPTS: Record<string, string> = {
  sales: SALES_SYSTEM_PROMPT,
  concierge: CONCIERGE_SYSTEM_PROMPT,
};

export default function PersonaPage() {
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [tenantIdError, setTenantIdError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const { draft: draftConfig, setDraft: setDraftConfig } = useStudioDraft();

  useEffect(() => {
    const supabase = createSupabaseClient();
    supabase.auth.getSession().then(async ({ data }) => {
      const session = data.session;
      if (session?.user) {
        const { data: tenantIdResult, error } = await resolveTenantId(session.user.id);
        if (error) {
          setTenantIdError(error.message);
        } else {
          setTenantId(tenantIdResult);
        }
      }
    });
  }, []);

  const handleModeChange = useCallback(
    (mode: 'sales' | 'concierge') => {
      setDraftConfig((prev) => ({
        ...prev,
        personaMode: mode,
        systemPrompt: DEFAULT_SYSTEM_PROMPTS[mode],
      }));
      setFeedback(null);
    },
    [setDraftConfig]
  );

  const handleSave = useCallback(async () => {
    setIsLoading(true);
    setFeedback(null);

    if (!tenantId) {
      setFeedback({
        type: 'error',
        message: tenantIdError || 'Unable to resolve tenant ID. Please refresh the page.',
      });
      setIsLoading(false);
      return;
    }

    try {
      const aiPersona: Partial<CanonicalAIPersona> = toCanonicalAIPersona(draftConfig);

      const studioConfig: Record<string, unknown> = {
        aiPersona,
      };

      const response = await fetch('/api/client/update-studio-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          studioConfig,
        }),
      });

      if (!response.ok) {
        let errorMessage = `HTTP ${response.status}`;
        try {
          const errorData = (await response.json()) as Record<string, unknown>;
          errorMessage = (errorData.error as string) || errorMessage;
        } catch {
          // If response is not JSON, use HTTP status message
        }
        throw new Error(errorMessage);
      }

      setFeedback({
        type: 'success',
        message: 'Persona configuration saved successfully!',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save configuration';
      setFeedback({ type: 'error', message });
    } finally {
      setIsLoading(false);
    }
  }, [draftConfig, tenantId, tenantIdError]);

  const clearFeedback = useCallback(() => {
    setFeedback(null);
  }, []);

  return (
    <div className="w-full rounded-2xl border border-white/10 bg-slate-950/15 backdrop-blur-xl p-4 sm:p-6">
      <div className="mb-6">
        <h2 className="text-sm font-medium text-white font-agrandir mb-1">
          Persona Configuration
        </h2>
        <p className="text-xs text-zinc-400 font-agrandir">
          Define the AI&apos;s operational mode, system directive, inference behavior, and voice fallback strategy.
        </p>
      </div>

      <div className="space-y-5">
        {/* Persona Mode Selector */}
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-2 font-agrandir">
            Persona Mode
          </label>
          <div className="grid grid-cols-2 gap-3">
            {PERSONA_MODES.map((mode) => {
              const isActive = draftConfig.personaMode === mode.value;
              return (
                <button
                  key={mode.value}
                  onClick={() => handleModeChange(mode.value)}
                  className={`rounded-xl px-4 py-3 text-left transition-all duration-200 border ${
                    isActive
                      ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300'
                      : 'bg-slate-900/40 border-white/10 text-zinc-400 hover:border-white/20 hover:text-zinc-300'
                  }`}
                >
                  <span className="block text-xs font-semibold font-agrandir">
                    {mode.label}
                  </span>
                  <span className="block text-[10px] mt-0.5 opacity-80">
                    {mode.value === 'sales' ? 'Lead qualification & conversion' : 'Premium hospitality & assistance'}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="text-xs text-zinc-500 mt-2">
            Switching modes resets the system prompt to the default template for that mode.
          </p>
        </div>

        {/* System Prompt */}
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-2 font-agrandir">
            System Prompt
          </label>
          <textarea
            value={draftConfig.systemPrompt}
            onChange={(e) => {
              setDraftConfig((prev) => ({ ...prev, systemPrompt: e.target.value }));
              clearFeedback();
            }}
            rows={6}
            placeholder="Enter the primary AI directive..."
            className="w-full px-3 py-2 rounded-lg bg-slate-900 text-white border border-white/10 focus:border-cyan-500 outline-none transition-colors text-sm font-mono resize-y"
          />
          <p className="text-xs text-zinc-500 mt-1">
            Multi-line directive that defines the AI&apos;s core behavior and response framework.
          </p>
        </div>

        {/* Temperature */}
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-2 font-agrandir">
            Temperature
          </label>
          <div className="flex items-center gap-4">
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={draftConfig.temperature}
              onChange={(e) => {
                setDraftConfig((prev) => ({ ...prev, temperature: parseFloat(e.target.value) }));
                clearFeedback();
              }}
              className="flex-1 h-2 bg-slate-900 rounded-lg appearance-none cursor-pointer accent-cyan-500"
            />
            <span className="text-xs font-mono text-cyan-400 w-10 text-right">
              {draftConfig.temperature.toFixed(1)}
            </span>
          </div>
          <p className="text-xs text-zinc-500 mt-1">
            Controls inference creativity. Lower values are more deterministic; higher values are more creative.
          </p>
        </div>

        {/* Voice Fallback Strategy */}
        <div className="rounded-xl border border-white/10 bg-slate-900/40 p-4">
          <p className="text-xs font-semibold text-white mb-3 font-agrandir">
            Voice Fallback Strategy
          </p>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-zinc-300 mb-2 font-agrandir">
              Preferred Voice
            </label>
            <select
              value={draftConfig.voiceId}
              onChange={(e) => {
                setDraftConfig((prev) => ({ ...prev, voiceId: e.target.value }));
                clearFeedback();
              }}
              className="w-full px-3 py-2 rounded-lg bg-slate-900 text-white border border-white/10 focus:border-cyan-500 outline-none transition-colors text-sm"
            >
              <option value="">Select a voice...</option>
              {VOICE_OPTIONS.map((voice) => (
                <option key={voice.value} value={voice.value}>
                  {voice.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-zinc-500 mt-1">
              The preferred voice for the ElevenLabs fallback path when primary TTS is unavailable.
            </p>
          </div>
        </div>
      </div>

      {feedback && (
        <div
          className={`mt-5 p-4 rounded-lg flex items-start gap-3 ${
            feedback.type === 'success'
              ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300'
              : 'bg-red-500/15 border border-red-500/30 text-red-300'
          }`}
          role="alert"
        >
          <span className="text-lg mt-0.5">
            {feedback.type === 'success' ? '✓' : '⚠'}
          </span>
          <div className="flex-1">
            <p className="text-sm">{feedback.message}</p>
          </div>
          <button
            onClick={clearFeedback}
            className="text-lg leading-none hover:opacity-70 transition-opacity"
            aria-label="Dismiss message"
          >
            ×
          </button>
        </div>
      )}

      <button
        onClick={handleSave}
        disabled={isLoading}
        className="mt-6 w-full py-2.5 rounded-lg bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white font-semibold text-sm transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-cyan-500/10 hover:shadow-cyan-500/20 font-agrandir"
        aria-busy={isLoading}
      >
        {isLoading ? 'Saving...' : 'Save Configuration'}
      </button>

      <p className="text-xs text-zinc-500 mt-3 text-center">
        Changes will be applied immediately across your widget
      </p>
    </div>
  );
}
