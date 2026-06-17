"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import {
  getBlueprintForIndustry,
  type AISettingsInput,
} from "@/config/ai-engine";
import { IntegrationSuite } from "@/components/reseller/IntegrationSuite";
import type { BookingProviderType } from "@/interfaces/booking-provider.interface";
import { useHannah } from "@/contexts/HannahContext";

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────
interface TenantSummary {
  id: string;
  name: string;
  category: string | null;
}

interface AIEngineStudioProps {
  tenants: TenantSummary[];
  resellerSlug: string;
}

type SaveStatus = "idle" | "saving" | "saved" | "error";

interface TenantHydrationData {
  ai_settings?: AISettingsInput | null;
  metadata?: unknown;
}

interface TenantIntegrationState {
  enabledAddons: boolean;
  bookingProviderType: BookingProviderType;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function isBookingProviderType(value: unknown): value is BookingProviderType {
  return value === "INTERNAL" || value === "EXTERNAL";
}

function readNestedRecord(
  source: Record<string, unknown>,
  path: readonly string[],
): Record<string, unknown> | null {
  let current: unknown = source;

  for (const segment of path) {
    const record = asRecord(current);
    if (!record) return null;
    current = record[segment];
  }

  return asRecord(current);
}

function readTenantIntegrationState(
  tenant: TenantHydrationData | null,
): TenantIntegrationState {
  const metadata = asRecord(tenant?.metadata) ?? {};
  const directProviderType = metadata.booking_provider_type;
  const directEnabled = metadata.enabled_addons;
  const booking =
    readNestedRecord(metadata, ["integrations", "booking"]) ??
    readNestedRecord(metadata, ["booking"]);
  const legacyProviderType = booking?.providerType;
  const legacyEnabled = booking?.enabled;

  return {
    enabledAddons:
      typeof directEnabled === "boolean" ? directEnabled : legacyEnabled === true,
    bookingProviderType: isBookingProviderType(directProviderType)
      ? directProviderType
      : isBookingProviderType(legacyProviderType)
        ? legacyProviderType
        : "INTERNAL",
  };
}

// Industry preset options for the select dropdown — all 6 vertical vectors
const INDUSTRY_OPTIONS = [
  { key: "HEALTHCARE", label: "Healthcare" },
  { key: "AUTOMOTIVE", label: "Automotive" },
  { key: "GENERAL", label: "General Business" },
  { key: "RETAIL", label: "Retail" },
  { key: "SIGNAL", label: "Signal Analytics" },
  { key: "INSURANCE", label: "Insurance" },
  { key: "AI_AUTOMATION", label: "AI Automation" }, // New AI Automation preset
] as const;

// ──────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────
export function AIEngineStudio({
  tenants,
}: AIEngineStudioProps) {
  // Tenant selection
  const [selectedTenantId, setSelectedTenantId] = useState<string>(
    tenants[0]?.id ?? "",
  );

  // Text area state
  const [initialGreeting, setInitialGreeting] = useState("");
  const [voicePersonaTone, setVoicePersonaTone] = useState("");
  const [voiceVocabularyStyle, setVoiceVocabularyStyle] = useState("");
  const [syncedWithBranding, setSyncedWithBranding] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [selectedTenantData, setSelectedTenantData] = useState<Record<string, unknown> | null>(null);
  const [integrationState, setIntegrationState] = useState<TenantIntegrationState>({
    enabledAddons: false,
    bookingProviderType: "INTERNAL",
  });
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── AI Cognition Integration ──────────────────────────────────────
  const { isRecording, isProcessing, transcript } = useHannah();

  const parseAICommand = useCallback((text: string): string | null => {
    const lower = text.toLowerCase();

    // Model switching
    if (lower.includes("switch model to premium") || lower.includes("use premium model"))
      return "__model_premium__";
    if (
      lower.includes("switch model to standard") ||
      lower.includes("use standard model")
    )
      return "__model_standard__";

    // Prompt optimization
    if (
      lower.includes("optimize fallback prompts") ||
      lower.includes("optimize prompts")
    )
      return "__optimize_prompts__";

    // Workspace actions
    if (
      lower.includes("clear workspace") ||
      lower.includes("clear configuration")
    )
      return "__clear_workspace__";
    if (lower.includes("reset to default")) return "__reset_default__";

    // Quick presets via voice
    if (lower.includes("apply healthcare preset")) return "HEALTHCARE";
    if (lower.includes("apply automotive preset")) return "AUTOMOTIVE";
    if (lower.includes("apply retail preset")) return "RETAIL";

    return null;
  }, []);

  // Derive status text from voice telemetry
  const derivedStatus = useMemo(() => {
    if (isProcessing) return "COMPILING AI ARRAYS...";
    if (isRecording) return "LISTENING...";
    return "STANDBY";
  }, [isProcessing, isRecording]);

  // Process transcript for AI commands
  useEffect(() => {
    if (!transcript || transcript.length === 0) return;

    const command = parseAICommand(transcript);
    if (!command) return;

    const timer = setTimeout(() => {
      if (command === "__model_premium__") {
        // Model tier switch acknowledgment
      }
      if (command === "__model_standard__") {
        // Model tier switch acknowledgment
      }
      if (command === "__clear_workspace__") {
        setInitialGreeting("");
        setVoicePersonaTone("");
        setVoiceVocabularyStyle("");
      }
      if (command === "__reset_default__") {
        setSelectedTenantId(tenants[0]?.id ?? "");
      }
    }, 0);

    return () => clearTimeout(timer);
  }, [transcript, parseAICommand, tenants, setInitialGreeting, setVoicePersonaTone, setVoiceVocabularyStyle, setSelectedTenantId]);

  const selectedTenant = useMemo(
    () => tenants.find((t) => t.id === selectedTenantId) ?? null,
    [tenants, selectedTenantId],
  );

  // Hydrate from ai_settings when tenant changes
  useEffect(() => {
    if (!selectedTenantId) return;
    let cancelled = false;

    async function hydrate() {
      try {
        const res = await fetch(`/api/tenants/${selectedTenantId}`);
        if (!res.ok) return;
        const tenant = await res.json() as TenantHydrationData;
        if (cancelled) return;

        setSelectedTenantData(tenant as Record<string, unknown>);
        setIntegrationState(readTenantIntegrationState(tenant));

        const settings = tenant.ai_settings;
        setInitialGreeting(settings?.initial_greeting ?? "");
        setVoicePersonaTone(settings?.voice_persona_tone ?? "");
        setVoiceVocabularyStyle(settings?.voice_vocabulary_style ?? "");
        setSyncedWithBranding(settings?.synced_with_branding ?? false);
      } catch {
        // Silently fall back to empty fields
        if (!cancelled) {
          setSelectedTenantData(null);
          setIntegrationState({
            enabledAddons: false,
            bookingProviderType: "INTERNAL",
          });
          setInitialGreeting("");
          setVoicePersonaTone("");
          setVoiceVocabularyStyle("");
          setSyncedWithBranding(false);
        }
      }
    }

    void hydrate();
    return () => { cancelled = true; };
  }, [selectedTenantId]);

  // Apply industry preset — overwrites all three text areas
  const handleApplyPreset = useCallback((industryKey: string) => {
    const blueprint = getBlueprintForIndustry(industryKey);
    setInitialGreeting(blueprint.initial_greeting);
    setVoicePersonaTone(blueprint.voice_persona_tone);
    setVoiceVocabularyStyle(blueprint.voice_vocabulary_style);
  }, []);

  // Save to API
  const handleSave = useCallback(async () => {
    if (!selectedTenantId) return;
    setSaveStatus("saving");

    try {
      const res = await fetch("/api/tenants/update-ai-engine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId: selectedTenantId,
          initialGreeting,
          voicePersonaTone,
          voiceVocabularyStyle,
          syncedWithBranding,
        }),
      });

      if (res.ok) {
        setSaveStatus("saved");
        if (successTimerRef.current) clearTimeout(successTimerRef.current);
        successTimerRef.current = setTimeout(() => setSaveStatus("idle"), 2500);
      } else {
        setSaveStatus("error");
        setTimeout(() => setSaveStatus("idle"), 3000);
      }
    } catch {
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 3000);
    }
  }, [selectedTenantId, initialGreeting, voicePersonaTone, voiceVocabularyStyle, syncedWithBranding]);

  const handleIntegrationSaved = useCallback(() => {
    if (!selectedTenantId) return;

    void fetch(`/api/tenants/${selectedTenantId}`)
      .then(async (res) => {
        if (!res.ok) return;
        const tenant = await res.json() as TenantHydrationData;
        setSelectedTenantData(tenant as Record<string, unknown>);
        setIntegrationState(readTenantIntegrationState(tenant));
      })
      .catch(() => {});
  }, [selectedTenantId]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
    };
  }, []);

  return (
    <div className="w-full space-y-4 sm:space-y-6">
      {/* ── Header ── */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-xl font-bold text-slate-100 tracking-tight uppercase">
            AI Engine Studio
          </h1>
          <span
            className={`text-[10px] tracking-[0.2em] uppercase font-bold transition-all duration-300 ease-in-out ${
              isRecording || isProcessing
                ? "text-[#00e5ff] drop-shadow-[0_0_8px_rgba(0,229,255,0.4)]"
                : "text-white/60"
            }`}
          >
            {derivedStatus}
          </span>
        </div>
        <p className="text-sm text-slate-200 mt-1">
          Configure voice personas, greetings, and vocabulary per client.
        </p>
      </div>

      {/* ── Tenant Selector ── */}
      <div className="rounded-xl backdrop-blur-md bg-white/5 border border-white/10 p-3 sm:p-4 transition-all duration-300 ease-in-out">
        <label className="text-[10px] tracking-[0.2em] uppercase text-slate-200 font-medium mb-2 block">
          Select Client
        </label>
        <select
          value={selectedTenantId}
          onChange={(e) => setSelectedTenantId(e.target.value)}
          className="w-full px-4 py-2.5 rounded-lg bg-white/10 border border-white/20 text-white text-sm tracking-wide outline-none focus:border-[#0097b2] focus:ring-1 focus:ring-[#0097b2]/50 transition-all appearance-none cursor-pointer"
        >
          {tenants.map((t) => (
            <option key={t.id} value={t.id} className="bg-slate-900 text-white">
              {t.name} {t.category ? `(${t.category})` : ""}
            </option>
          ))}
        </select>
      </div>

      {selectedTenant && (
        <>
          {/* ── Industry Preset Templates ── */}
          <div className="rounded-xl backdrop-blur-md bg-white/5 border border-white/10 p-3 sm:p-4 transition-all duration-300 ease-in-out">
            <p className="text-[10px] tracking-[0.2em] uppercase text-slate-200 font-medium mb-3">
              Industry Preset Templates
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {INDUSTRY_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => handleApplyPreset(opt.key)}
                  className="px-4 py-2 rounded-lg border border-white/20 bg-slate-950/60 backdrop-blur-md text-slate-100 text-[11px] font-semibold tracking-wider uppercase transition-all duration-200 hover:bg-slate-900/80 hover:border-cyan-500/30 hover:shadow-[0_0_12px_rgba(0,151,178,0.2)]"
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-slate-200 mt-2">
              Clicking a preset will overwrite the fields below.
            </p>
          </div>

          {/* ── Text Area Blocks ── */}
          <div className="space-y-4">
            {/* Initial Greeting */}
            <div className="rounded-xl backdrop-blur-md bg-white/5 border border-white/10 p-3 sm:p-4 transition-all duration-300 ease-in-out">
              <label className="text-[10px] tracking-[0.2em] uppercase text-slate-200 font-medium mb-2 block">
                Initial Greeting
              </label>
              <textarea
                value={initialGreeting}
                onChange={(e) => setInitialGreeting(e.target.value)}
                rows={3}
                className="w-full px-4 py-3 rounded-lg bg-white/10 border border-white/20 text-white text-sm tracking-wide outline-none focus:border-[#0097b2] focus:ring-1 focus:ring-[#0097b2]/50 transition-all resize-y placeholder:text-white/30"
                placeholder="The greeting the AI speaks on first contact..."
              />
            </div>

            {/* Voice Persona & Tone */}
            <div className="rounded-xl backdrop-blur-md bg-white/5 border border-white/10 p-3 sm:p-4 transition-all duration-300 ease-in-out">
              <label className="text-[10px] tracking-[0.2em] uppercase text-slate-200 font-medium mb-2 block">
                Voice Persona & Tone
              </label>
              <textarea
                value={voicePersonaTone}
                onChange={(e) => setVoicePersonaTone(e.target.value)}
                rows={4}
                className="w-full px-4 py-3 rounded-lg bg-white/10 border border-white/20 text-white text-sm tracking-wide outline-none focus:border-[#0097b2] focus:ring-1 focus:ring-[#0097b2]/50 transition-all resize-y placeholder:text-white/30"
                placeholder="Character traits, constraints, and professional guardrails..."
              />
            </div>

            {/* Vocabulary & Dialect Style */}
            <div className="rounded-xl backdrop-blur-md bg-white/5 border border-white/10 p-3 sm:p-4 transition-all duration-300 ease-in-out">
              <label className="text-[10px] tracking-[0.2em] uppercase text-slate-200 font-medium mb-2 block">
                Vocabulary & Dialect Style
              </label>
              <textarea
                value={voiceVocabularyStyle}
                onChange={(e) => setVoiceVocabularyStyle(e.target.value)}
                rows={4}
                className="w-full px-4 py-3 rounded-lg bg-white/10 border border-white/20 text-white text-sm tracking-wide outline-none focus:border-[#0097b2] focus:ring-1 focus:ring-[#0097b2]/50 transition-all resize-y placeholder:text-white/30"
                placeholder="Linguistic instructions, preferred terms, regional conventions..."
              />
            </div>
          </div>

          {selectedTenantData && (
            <IntegrationSuite
              key={selectedTenantId}
              tenantId={selectedTenantId}
              tenant={selectedTenantData}
              initialEnabled={integrationState.enabledAddons}
              initialProviderType={integrationState.bookingProviderType}
              onSaved={handleIntegrationSaved}
            />
          )}

          {/* ── Synced with Branding Toggle ── */}
          <div className="rounded-xl backdrop-blur-md bg-white/5 border border-white/10 p-3 sm:p-4 transition-all duration-300 ease-in-out">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] tracking-[0.2em] uppercase text-slate-200 font-medium">
                  Synced with Branding
                </p>
                <p className="text-[10px] text-slate-200 mt-0.5">
                  When enabled, voice persona aligns with the brand profile.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSyncedWithBranding(!syncedWithBranding)}
                className={`relative w-12 h-6 rounded-full transition-all duration-300 ${
                  syncedWithBranding
                    ? "bg-[#0097b2] shadow-[0_0_8px_rgba(0,151,178,0.4)]"
                    : "bg-white/20"
                }`}
              >
                <span
                  className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all duration-300 ${
                    syncedWithBranding ? "left-[26px]" : "left-0.5"
                  }`}
                />
              </button>
            </div>
          </div>

          {/* ── Save + Status ── */}
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={handleSave}
              disabled={saveStatus === "saving"}
              className={`px-6 py-2.5 rounded-lg border text-xs tracking-widest uppercase transition-all duration-200 font-medium ${
                saveStatus === "saving"
                  ? "border-[#0097b2]/50 bg-[#0097b2]/10 text-[#0097b2] cursor-wait"
                  : saveStatus === "saved"
                    ? "border-emerald-500 bg-emerald-500/20 text-emerald-300"
                    : saveStatus === "error"
                      ? "border-red-500 bg-red-500/20 text-red-300"
                      : "border-[#0097b2] bg-[#0097b2]/20 text-[#D4AF37] hover:bg-[#0097b2]/30 hover:shadow-[0_0_20px_rgba(0,151,178,0.5)]"
              }`}
            >
              {saveStatus === "saving" ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Saving
                </span>
              ) : saveStatus === "saved" ? (
                "Saved ✓"
              ) : saveStatus === "error" ? (
                "Error — Retry"
              ) : (
                "Save Changes"
              )}
            </button>

            {saveStatus === "idle" && (
              <span className="text-[10px] text-slate-200 tracking-wider">
                All changes are applied per client.
              </span>
            )}
          </div>
        </>
      )}

      {/* ── Empty state: no tenants ── */}
      {tenants.length === 0 && (
        <div className="flex items-center justify-center min-h-[200px] rounded-xl backdrop-blur-md bg-white/5 border border-white/10">
          <div className="text-center space-y-2">
            <p className="text-slate-100 text-sm font-medium tracking-widest uppercase">
              No clients found
            </p>
            <p className="text-slate-200 text-xs">
              Add a client first to configure their AI engine settings.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}