"use client";

import { useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { getBlueprintForIndustry } from "@/config/ai-engine";

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────
interface ClientOnboardingWizardProps {
  resellerSlug: string;
}

type Step = 1 | 2 | 3;
type IndustryKey = "HEALTHCARE" | "AUTOMOTIVE" | "GENERAL";

interface FormData {
  name: string;
  email: string;
  websiteUrl: string;
  industry: IndustryKey;
}

type SaveStatus = "idle" | "saving" | "saved" | "error";

const INDUSTRY_OPTIONS: { key: IndustryKey; label: string }[] = [
  { key: "HEALTHCARE", label: "Healthcare" },
  { key: "AUTOMOTIVE", label: "Automotive" },
  { key: "GENERAL", label: "General Business" },
];

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_REGEX = /^https?:\/\/.+\..+/i;

// ──────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────
export function ClientOnboardingWizard({
  resellerSlug,
}: ClientOnboardingWizardProps) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [form, setForm] = useState<FormData>({
    name: "",
    email: "",
    websiteUrl: "",
    industry: "GENERAL",
  });
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof FormData, string>>>({});

  // Validation
  const validations = useMemo(() => {
    const errs: Partial<Record<keyof FormData, string>> = {};
    if (!form.name.trim()) errs.name = "Client name is required";
    if (form.email && !EMAIL_REGEX.test(form.email)) errs.email = "Invalid email format";
    if (form.websiteUrl && !URL_REGEX.test(form.websiteUrl)) errs.websiteUrl = "Invalid URL (must start with http:// or https://)";
    return errs;
  }, [form]);

  const canProceedStep1 = useMemo(
    () => form.name.trim().length > 0 && !validations.email && !validations.websiteUrl,
    [form.name, validations],
  );

  const handleFieldChange = useCallback(
    (field: keyof FormData, value: string) => {
      setForm((prev) => ({ ...prev, [field]: value }));
      // Clear error on change
      setFieldErrors((prev) => ({ ...prev, [field]: "" }));
    },
    [],
  );

  const handleNext = useCallback(() => {
    // Validate before advancing
    const errs: Partial<Record<keyof FormData, string>> = {};
    if (!form.name.trim()) errs.name = "Client name is required";
    if (form.email && !EMAIL_REGEX.test(form.email)) errs.email = "Invalid email format";
    if (form.websiteUrl && !URL_REGEX.test(form.websiteUrl)) errs.websiteUrl = "Invalid URL";
    setFieldErrors(errs);

    if (Object.keys(errs).length > 0) return;

    if (step === 1) setStep(2);
    else if (step === 2) setStep(3);
  }, [step, form]);

  const handleBack = useCallback(() => {
    if (step === 2) setStep(1);
    else if (step === 3) setStep(2);
  }, [step]);

  // Submit
  const handleSubmit = useCallback(async () => {
    setSaveStatus("saving");
    try {
      const res = await fetch("/api/reseller/tenants/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resellerSlug,
          name: form.name.trim(),
          email: form.email.trim() || null,
          websiteUrl: form.websiteUrl.trim() || null,
          industry: form.industry,
        }),
      });

      const data = await res.json() as { success: boolean; tenantId?: string };
      if (res.ok && data.success) {
        setSaveStatus("saved");
        // Redirect to clients page after brief delay
        setTimeout(() => {
          router.push(`/reseller/${resellerSlug}/clients`);
        }, 1200);
      } else {
        setSaveStatus("error");
        setTimeout(() => setSaveStatus("idle"), 3000);
      }
    } catch {
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 3000);
    }
  }, [resellerSlug, form, router]);

  // Preview blueprint for the selected industry
  const selectedBlueprint = useMemo(
    () => getBlueprintForIndustry(form.industry),
    [form.industry],
  );

  return (
    <div className="w-full space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-white tracking-tight uppercase">
          New Client Profile
        </h1>
        <p className="text-sm text-white/50 mt-1">
          Step {step} of 3
        </p>
      </div>

      {/* Step Indicator */}
      <div className="flex items-center gap-2">
        {([1, 2, 3] as const).map((s) => (
          <div key={s} className="flex items-center gap-2">
            <span
              className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold transition-all duration-300 ${
                s === step
                  ? "bg-[#0097b2] text-white shadow-[0_0_8px_rgba(0,151,178,0.4)]"
                  : s < step
                    ? "bg-emerald-500/30 text-emerald-300 border border-emerald-500/30"
                    : "bg-white/10 text-white/40 border border-white/20"
              }`}
            >
              {s < step ? "✓" : s}
            </span>
            {s < 3 && (
              <div
                className={`w-8 h-px transition-all duration-300 ${
                  s < step ? "bg-emerald-500/50" : "bg-white/10"
                }`}
              />
            )}
          </div>
        ))}
      </div>

      {/* ── Step 1: Company Details ── */}
      {step === 1 && (
        <div className="rounded-xl backdrop-blur-md bg-slate-900/80 border border-white/10 p-6 space-y-5">
          <p className="text-[10px] tracking-[0.2em] uppercase text-white/40 font-medium">
            Company Details
          </p>

          {/* Name */}
          <div>
            <label className="text-xs text-white/60 tracking-wide mb-1.5 block">
              Client Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => handleFieldChange("name", e.target.value)}
              placeholder="e.g. BDM Test"
              className={`w-full px-4 py-2.5 rounded-lg bg-white/10 border text-sm text-white tracking-wide outline-none transition-all placeholder:text-white/30 ${
                fieldErrors.name
                  ? "border-red-500 focus:border-red-500"
                  : "border-white/20 focus:border-[#0097b2] focus:ring-1 focus:ring-[#0097b2]/50"
              }`}
            />
            {fieldErrors.name && (
              <p className="text-[10px] text-red-400 mt-1">{fieldErrors.name}</p>
            )}
          </div>

          {/* Email */}
          <div>
            <label className="text-xs text-white/60 tracking-wide mb-1.5 block">
              Email Address
            </label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => handleFieldChange("email", e.target.value)}
              placeholder="client@example.com"
              className={`w-full px-4 py-2.5 rounded-lg bg-white/10 border text-sm text-white tracking-wide outline-none transition-all placeholder:text-white/30 ${
                fieldErrors.email
                  ? "border-red-500 focus:border-red-500"
                  : "border-white/20 focus:border-[#0097b2] focus:ring-1 focus:ring-[#0097b2]/50"
              }`}
            />
            {fieldErrors.email && (
              <p className="text-[10px] text-red-400 mt-1">{fieldErrors.email}</p>
            )}
          </div>

          {/* Website URL */}
          <div>
            <label className="text-xs text-white/60 tracking-wide mb-1.5 block">
              Website URL
            </label>
            <input
              type="url"
              value={form.websiteUrl}
              onChange={(e) => handleFieldChange("websiteUrl", e.target.value)}
              placeholder="https://example.com"
              className={`w-full px-4 py-2.5 rounded-lg bg-white/10 border text-sm text-white tracking-wide outline-none transition-all placeholder:text-white/30 ${
                fieldErrors.websiteUrl
                  ? "border-red-500 focus:border-red-500"
                  : "border-white/20 focus:border-[#0097b2] focus:ring-1 focus:ring-[#0097b2]/50"
              }`}
            />
            {fieldErrors.websiteUrl && (
              <p className="text-[10px] text-red-400 mt-1">{fieldErrors.websiteUrl}</p>
            )}
          </div>

          {/* Next Button */}
          <div className="flex justify-end pt-2">
            <button
              type="button"
              onClick={handleNext}
              disabled={!canProceedStep1}
              className={`px-6 py-2.5 rounded-lg border text-xs tracking-widest uppercase transition-all duration-200 font-medium ${
                canProceedStep1
                  ? "border-[#0097b2] bg-[#0097b2]/20 text-[#D4AF37] hover:bg-[#0097b2]/30 hover:shadow-[0_0_20px_rgba(0,151,178,0.5)]"
                  : "border-white/10 bg-white/5 text-white/30 cursor-not-allowed"
              }`}
            >
              Next — Market Fit
            </button>
          </div>
        </div>
      )}

      {/* ── Step 2: Market Fit Profiling ── */}
      {step === 2 && (
        <div className="rounded-xl backdrop-blur-md bg-slate-900/80 border border-white/10 p-6 space-y-5">
          <p className="text-[10px] tracking-[0.2em] uppercase text-white/40 font-medium">
            Market Fit Profiling
          </p>

          {/* Industry Selector */}
          <div>
            <label className="text-xs text-white/60 tracking-wide mb-1.5 block">
              Industry Vertical
            </label>
            <select
              value={form.industry}
              onChange={(e) => handleFieldChange("industry", e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg bg-white/10 border border-white/20 text-white text-sm tracking-wide outline-none focus:border-[#0097b2] focus:ring-1 focus:ring-[#0097b2]/50 transition-all appearance-none cursor-pointer"
            >
              {INDUSTRY_OPTIONS.map((opt) => (
                <option key={opt.key} value={opt.key} className="bg-slate-900 text-white">
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Informative note */}
          <div className="rounded-lg bg-[#0097b2]/10 border border-[#0097b2]/20 px-4 py-3">
            <p className="text-xs text-white/70 leading-relaxed">
              This selection will automatically pre-seed the core AI voice persona
              with localized South African terminology and behavioural guardrails specific
              to the{" "}
              <span className="text-[#00e5ff] font-medium">
                {INDUSTRY_OPTIONS.find((o) => o.key === form.industry)?.label ?? ""}
              </span>{" "}
              vertical. You can fine-tune these settings later in the AI Engine Studio.
            </p>
          </div>

          {/* Blueprint Preview */}
          <div className="rounded-lg bg-white/5 border border-white/10 px-4 py-3 space-y-2">
            <p className="text-[10px] tracking-[0.2em] uppercase text-white/30 font-medium">
              Preview — Initial Greeting
            </p>
            <p className="text-sm text-white/70 italic">
              &ldquo;{selectedBlueprint.initial_greeting}&rdquo;
            </p>
          </div>

          {/* Navigation Buttons */}
          <div className="flex justify-between pt-2">
            <button
              type="button"
              onClick={handleBack}
              className="px-5 py-2.5 rounded-lg border border-white/20 bg-white/5 text-white/60 text-xs tracking-widest uppercase hover:bg-white/10 hover:text-white transition-all duration-200"
            >
              ← Back
            </button>
            <button
              type="button"
              onClick={handleNext}
              className="px-6 py-2.5 rounded-lg border border-[#0097b2] bg-[#0097b2]/20 text-[#D4AF37] text-xs tracking-widest uppercase hover:bg-[#0097b2]/30 hover:shadow-[0_0_20px_rgba(0,151,178,0.5)] transition-all duration-200 font-medium"
            >
              Next — Review
            </button>
          </div>
        </div>
      )}

      {/* ── Step 3: Review & Provision ── */}
      {step === 3 && (
        <div className="rounded-xl backdrop-blur-md bg-slate-900/80 border border-white/10 p-6 space-y-5">
          <p className="text-[10px] tracking-[0.2em] uppercase text-white/40 font-medium">
            Review & Provision
          </p>

          {/* Summary Slate */}
          <div className="rounded-lg bg-white/5 border border-white/10 divide-y divide-white/5">
            <SummaryRow label="Client Name" value={form.name} />
            <SummaryRow label="Email" value={form.email || "—"} />
            <SummaryRow label="Website" value={form.websiteUrl || "—"} />
            <SummaryRow
              label="Industry"
              value={INDUSTRY_OPTIONS.find((o) => o.key === form.industry)?.label ?? form.industry}
            />
            <SummaryRow label="Default Plan" value="Standard (R 2,450/mo)" />
          </div>

          {/* Save Button */}
          <div className="flex justify-between pt-2">
            <button
              type="button"
              onClick={handleBack}
              disabled={saveStatus === "saving"}
              className="px-5 py-2.5 rounded-lg border border-white/20 bg-white/5 text-white/60 text-xs tracking-widest uppercase hover:bg-white/10 hover:text-white transition-all duration-200 disabled:opacity-50"
            >
              ← Back
            </button>

            <button
              type="button"
              onClick={handleSubmit}
              disabled={saveStatus === "saving" || saveStatus === "saved"}
              className={`px-6 py-2.5 rounded-lg border text-xs tracking-widest uppercase transition-all duration-200 font-medium min-w-[180px] ${
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
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Creating...
                </span>
              ) : saveStatus === "saved" ? (
                "Redirecting ✓"
              ) : saveStatus === "error" ? (
                "Retry"
              ) : (
                "Create Client Profile"
              )}
            </button>
          </div>

          {saveStatus === "saved" && (
            <p className="text-[10px] text-emerald-400/70 text-center tracking-wider">
              Client profile created. Redirecting to your dashboard...
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────
// Summary Row Sub-component
// ──────────────────────────────────────────────
function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <span className="text-xs text-white/50 tracking-wide">{label}</span>
      <span className="text-sm text-white/90 font-medium truncate ml-4 max-w-[240px]">
        {value}
      </span>
    </div>
  );
}