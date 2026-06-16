"use client";

import { useState, useMemo, useCallback } from "react";
import { Dialog, Transition } from "@headlessui/react";
import { PLAN_TIER_COSTS, ADDON_COSTS } from "@/config/pricing";

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────
type PlanTierKey = "standard" | "premium" | "enterprise";
type IndicatorStatus = "active" | "inactive";

export interface TenantPricingModalTenant {
  id: string;
  name: string;
  plan_tier?: string | null;
  mrr?: string | null;
  indicators?: { sms?: string; signal?: string } | null;
}

interface TenantPricingModalProps {
  tenant: TenantPricingModalTenant;
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  isSaving?: boolean;
}

// ──────────────────────────────────────────────
// Add-on toggle row sub-component
// ──────────────────────────────────────────────
function AddOnToggle({
  label,
  cost,
  enabled,
  onChange,
}: {
  label: string;
  cost: number;
  enabled: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!enabled)}
      className={`w-full flex items-center justify-between px-4 py-3 rounded-lg border transition-all duration-200 ${
        enabled
          ? "border-emerald-500/50 bg-emerald-500/10 text-white"
          : "border-white/10 bg-white/5 text-white/60 hover:border-white/20 hover:bg-white/10"
      }`}
    >
      <div className="flex items-center gap-3">
        <span
          className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${
            enabled
              ? "bg-emerald-500 border-emerald-500"
              : "border-white/30 bg-transparent"
          }`}
        >
          {enabled && (
            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          )}
        </span>
        <span className="text-sm font-medium tracking-wide">{label}</span>
      </div>
      <span className="text-sm font-mono text-[#D4AF37]">R {cost.toLocaleString()}</span>
    </button>
  );
}

// ──────────────────────────────────────────────
// Plan Tier radio row sub-component
// ──────────────────────────────────────────────
function PlanTierRadio({
  value,
  label,
  wholesale,
  retail,
  selected,
  onChange,
}: {
  value: PlanTierKey;
  label: string;
  wholesale: number;
  retail: number;
  selected: boolean;
  onChange: (v: PlanTierKey) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(value)}
      className={`w-full flex items-center justify-between px-4 py-3 rounded-lg border transition-all duration-200 ${
        selected
          ? "border-[#0097b2] bg-[#0097b2]/10 text-white shadow-[0_0_12px_rgba(0,151,178,0.2)]"
          : "border-white/10 bg-white/5 text-white/60 hover:border-white/20 hover:bg-white/10"
      }`}
    >
      <div className="flex items-center gap-3">
        <span
          className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all ${
            selected ? "border-[#0097b2]" : "border-white/30"
          }`}
        >
          {selected && (
            <span className="w-2 h-2 rounded-full bg-[#0097b2]" />
          )}
        </span>
        <span className="text-sm font-medium tracking-wide">{label}</span>
      </div>
      <div className="flex items-center gap-4 text-sm">
        <span className="text-white/40 line-through">R {wholesale.toLocaleString()}</span>
        <span className="font-mono text-[#D4AF37] font-bold">R {retail.toLocaleString()}</span>
      </div>
    </button>
  );
}

// ──────────────────────────────────────────────
// Main Modal Component
// ──────────────────────────────────────────────
export function TenantPricingModal({
  tenant,
  isOpen,
  onClose,
  onSaved,
  isSaving: externalSaving,
}: TenantPricingModalProps) {
  // Initialise from tenant data
  const initialTier = (
    ["standard", "premium", "enterprise"].includes(tenant.plan_tier ?? "")
      ? (tenant.plan_tier as PlanTierKey)
      : "standard"
  );

  const [selectedTier, setSelectedTier] = useState<PlanTierKey>(initialTier);
  const [whatsappActive, setWhatsappActive] = useState(
    tenant.indicators?.sms === "active",
  );
  const [signalsActive, setSignalsActive] = useState(
    tenant.indicators?.signal === "active",
  );
  const [internalSaving, setInternalSaving] = useState(false);

  const isSaving = externalSaving ?? internalSaving;

  // Live computed retail price
  const computedRetail = useMemo(() => {
    const base = PLAN_TIER_COSTS[selectedTier]?.suggestedRetail ?? 0;
    const addons =
      (whatsappActive ? ADDON_COSTS.whatsapp.retail : 0) +
      (signalsActive ? ADDON_COSTS.highVolumeSignals.retail : 0);
    return base + addons;
  }, [selectedTier, whatsappActive, signalsActive]);

  // Save handler — POST to the authoritative API route
  const handleSave = useCallback(async () => {
    setInternalSaving(true);
    try {
      const res = await fetch("/api/tenants/update-pricing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId: tenant.id,
          planTier: selectedTier,
          indicators: {
            sms: whatsappActive ? "active" as IndicatorStatus : "inactive" as IndicatorStatus,
            signal: signalsActive ? "active" as IndicatorStatus : "inactive" as IndicatorStatus,
          },
        }),
      });

      if (res.ok) {
        onSaved();
        onClose();
      }
    } catch (_err) {
      console.error("Failed to save pricing:", _err);
    } finally {
      setInternalSaving(false);
    }
  }, [tenant.id, selectedTier, whatsappActive, signalsActive, onSaved, onClose]);

  // Reset internal state when tenant changes
  const handleClose = useCallback(() => {
    setSelectedTier(initialTier);
    setWhatsappActive(tenant.indicators?.sms === "active");
    setSignalsActive(tenant.indicators?.signal === "active");
    setInternalSaving(false);
    onClose();
  }, [initialTier, tenant.indicators, onClose]);

  return (
    <Transition appear show={isOpen} as="div">
      <Dialog as="div" className="relative z-50" onClose={handleClose}>
        {/* Backdrop */}
        <Transition.Child
          as="div"
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" />
        </Transition.Child>

        {/* Modal Container */}
        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <Transition.Child
              as="div"
              className="relative w-full max-w-lg"
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full transform rounded-2xl backdrop-blur-xl bg-black/60 border border-white/10 p-6 text-left align-middle shadow-[0_0_40px_rgba(0,0,0,0.5)] transition-all">
                {/* Header */}
                <Dialog.Title
                  as="h3"
                  className="text-lg font-medium leading-6 text-white tracking-[0.1em] uppercase mb-1"
                >
                  Pricing & Add-Ons
                </Dialog.Title>
                <p className="text-sm text-white/50 mb-5">
                  {tenant.name}
                </p>

                {/* ── Plan Tier Section ── */}
                <div className="mb-5">
                  <p className="text-[10px] tracking-[0.2em] uppercase text-white/40 font-medium mb-2">
                    Plan Tier
                  </p>
                  <div className="space-y-2">
                    <PlanTierRadio
                      value="standard"
                      label="Standard"
                      wholesale={PLAN_TIER_COSTS.standard.wholesaleCost}
                      retail={PLAN_TIER_COSTS.standard.suggestedRetail}
                      selected={selectedTier === "standard"}
                      onChange={setSelectedTier}
                    />
                    <PlanTierRadio
                      value="premium"
                      label="Premium"
                      wholesale={PLAN_TIER_COSTS.premium.wholesaleCost}
                      retail={PLAN_TIER_COSTS.premium.suggestedRetail}
                      selected={selectedTier === "premium"}
                      onChange={setSelectedTier}
                    />
                    <PlanTierRadio
                      value="enterprise"
                      label="Enterprise"
                      wholesale={PLAN_TIER_COSTS.enterprise.wholesaleCost}
                      retail={PLAN_TIER_COSTS.enterprise.suggestedRetail}
                      selected={selectedTier === "enterprise"}
                      onChange={setSelectedTier}
                    />
                  </div>
                </div>

                {/* ── Add-On Section ── */}
                <div className="mb-5">
                  <p className="text-[10px] tracking-[0.2em] uppercase text-white/40 font-medium mb-2">
                    Add-Ons
                  </p>
                  <div className="space-y-2">
                    <AddOnToggle
                      label="WhatsApp Core Link"
                      cost={ADDON_COSTS.whatsapp.retail}
                      enabled={whatsappActive}
                      onChange={setWhatsappActive}
                    />
                    <AddOnToggle
                      label="High-Volume Signals Pack"
                      cost={ADDON_COSTS.highVolumeSignals.retail}
                      enabled={signalsActive}
                      onChange={setSignalsActive}
                    />
                  </div>
                </div>

                {/* ── Estimated Retail Summary ── */}
                <div className="mb-6 p-4 rounded-xl bg-gradient-to-r from-[#0097b2]/10 to-[#D4AF37]/10 border border-[#0097b2]/20">
                  <div className="flex items-center justify-between">
                    <span className="text-xs tracking-[0.15em] uppercase text-white/60 font-medium">
                      Estimated Retail / mo
                    </span>
                    <span className="text-xl font-bold font-mono text-[#D4AF37] drop-shadow-[0_0_8px_rgba(212,175,55,0.3)]">
                      R {computedRetail.toLocaleString()}
                    </span>
                  </div>
                  <p className="text-[10px] text-white/30 mt-1">
                    Plan retail + active add-on fees
                  </p>
                </div>

                {/* ── Footer Actions ── */}
                <div className="flex gap-3 justify-end">
                  <button
                    type="button"
                    onClick={handleClose}
                    disabled={isSaving}
                    className="px-5 py-2 rounded-lg border border-white/20 bg-white/5 text-white/70 text-xs tracking-widest uppercase transition-all duration-200 hover:bg-white/10 hover:text-white hover:border-white/30 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={isSaving}
                    className={`relative px-5 py-2 rounded-lg border text-xs tracking-widest uppercase transition-all duration-200 overflow-hidden ${
                      isSaving
                        ? "border-[#0097b2]/50 bg-[#0097b2]/10 text-[#0097b2] cursor-wait"
                        : "border-[#0097b2] bg-[#0097b2]/20 text-[#D4AF37] hover:bg-[#0097b2]/30 hover:shadow-[0_0_20px_rgba(0,151,178,0.5)]"
                    }`}
                  >
                    {isSaving ? (
                      <span className="flex items-center gap-2">
                        <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        SAVING
                      </span>
                    ) : (
                      "Save Changes"
                    )}
                  </button>
                </div>
              </Dialog.Panel>

              {/* Close Button */}
              <button
                type="button"
                onClick={handleClose}
                aria-label="Close modal"
                className="absolute top-4 right-4 z-[9999] pointer-events-auto flex items-center justify-center w-8 h-8 rounded-lg backdrop-blur-md bg-white/15 border border-white/30 text-white shadow-[0_0_20px_rgba(0,0,0,0.4)] transition-all duration-200 hover:bg-white/30 hover:border-white/50"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}