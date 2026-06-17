"use client";

import { useMemo, useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { calculateResellerSplits } from "@/config/pricing";
import { useHannah } from "@/contexts/HannahContext";

// ──────────────────────────────────────────────
// Data shape matching the server-side query
// ──────────────────────────────────────────────
interface TenantLedgerRow {
  name: string;
  plan_tier: string | null;
  mrr: string | null;
  revenue_total: string | null;
  is_active: boolean;
  email: string | null;
  created_at: string;
}

// ──────────────────────────────────────────────
// Props received from the parent server component
// ──────────────────────────────────────────────
interface ClientRevenueDashboardProps {
  initialTenants: TenantLedgerRow[];
  resellerSlug: string;
}

// ──────────────────────────────────────────────
// Client Component — Revenue Dashboard Shell
// ──────────────────────────────────────────────
export function ClientRevenueDashboard({
  initialTenants,
  resellerSlug,
}: ClientRevenueDashboardProps) {
  // Derive aggregate metrics from the hydrated data using tier-aware splits
  const metrics = useMemo(() => {
    const splits = calculateResellerSplits(initialTenants);
    const totalRevenue = initialTenants.reduce(
      (sum, t) => sum + (parseFloat(t.revenue_total ?? "0")),
      0,
    );
    const activeCount = initialTenants.filter((t) => t.is_active).length;

    return {
      totalGrossMrr: splits.totalGrossMrr,
      totalWholesaleCost: splits.totalWholesaleCost,
      totalResellerTakeHome: splits.totalResellerTakeHome,
      totalRevenue,
      activeCount,
      totalTenants: initialTenants.length,
    };
  }, [initialTenants]);

  // ── Financial Cognition Integration ────────────────────────────────
  const {
    isRecording,
    isProcessing,
    transcript,
    startListening: _startListening,
    stopListeningAndProcess: _stopListeningAndProcess,
    resetState: _resetState,
  } = useHannah();

  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  // Parse financial voice commands from transcript
  const parseFinancialCommand = useCallback(
    (text: string): string | null => {
      const lower = text.toLowerCase();

      // Detect category filter requests
      if (lower.includes("healthcare") || lower.includes("health")) return "Healthcare";
      if (lower.includes("automotive") || lower.includes("auto")) return "Automotive";
      if (lower.includes("technology") || lower.includes("tech")) return "Technology";
      if (lower.includes("education") || lower.includes("edu")) return "Education";
      if (lower.includes("retail") || lower.includes("store")) return "Retail";
      if (lower.includes("finance") || lower.includes("fintech")) return "Finance";
      if (
        lower.includes("show all") ||
        lower.includes("all categories") ||
        lower.includes("clear filter") ||
        lower.includes("reset")
      ) {
        return "all";
      }

      // Detect metric focus requests
      if (lower.includes("show mrr") || lower.includes("total mrr")) return "__show_mrr__";
      if (lower.includes("show revenue") || lower.includes("total revenue")) return "__show_revenue__";
      if (
        lower.includes("wholesale") ||
        lower.includes("cost") ||
        lower.includes("expenses")
      ) {
        return "__show_wholesale__";
      }
      if (
        lower.includes("take home") ||
        lower.includes("profit") ||
        lower.includes("earnings")
      ) {
        return "__show_takehome__";
      }

      return null;
    },
    [],
  );

  // Map categories from tenant data
  const categories = useMemo(() => {
    const set = new Set<string>();
    initialTenants.forEach((t) => {
      if (t.plan_tier) set.add(t.plan_tier);
    });
    return Array.from(set).sort();
  }, [initialTenants]);

  // Filter tenants based on category filter
  const filteredTenants = useMemo(() => {
    if (categoryFilter === "all") return initialTenants;
    return initialTenants.filter((t) => t.plan_tier === categoryFilter);
  }, [initialTenants, categoryFilter]);

  // Process transcript when it changes
  useEffect(() => {
    if (!transcript || transcript.length === 0) return;

    const command = parseFinancialCommand(transcript);
    if (!command) return;

    const timer = setTimeout(() => {
      if (command.startsWith("__show_")) {
        // Metric focus commands - could scroll to specific metric card
        // For now, we just acknowledge the command
      } else if (command !== "all") {
        // Category filter command
        setCategoryFilter(command);
      } else {
        setCategoryFilter("all");
      }
    }, 0);

    return () => clearTimeout(timer);
  }, [transcript, parseFinancialCommand]);

  // Compute status text for telemetry (derived, no setState in effect)
  const statusText = useMemo(() => {
    if (isRecording) return "LISTENING...";
    if (isProcessing) return "PROCESSING...";
    return "STANDBY";
  }, [isRecording, isProcessing]);

  return (
    <div className="w-full space-y-6">
      {/* Back to Clients Navigation */}
      <Link
        href={`/reseller/${resellerSlug}/clients`}
        className="text-white/60 hover:text-white/100 text-sm flex items-center gap-2 mb-6 transition-all duration-200 w-fit"
      >
        <span aria-hidden="true">←</span>
        Back to Clients
      </Link>

      {/* Context Status Indicator */}
      <div className="flex items-center gap-3">
        <span className="text-[10px] tracking-[0.2em] uppercase text-white/40 font-medium">
          SYSTEM STATUS
        </span>
        <span
          className={`text-[10px] tracking-[0.2em] uppercase font-bold transition-all duration-300 ease-in-out ${
            isRecording || isProcessing
              ? "text-[#00e5ff] drop-shadow-[0_0_8px_rgba(0,229,255,0.4)]"
              : "text-white/60"
          }`}
        >
          {statusText}
        </span>
      </div>

      {/* Metric Cards — Tier-Aware 50/50 Split View */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 transition-all duration-300 ease-in-out">
        <MetricCard label="Gross MRR" value={`R ${metrics.totalGrossMrr.toLocaleString('en-ZA')}`} />
        <MetricCard label="Wholesale Cost" value={`R ${metrics.totalWholesaleCost.toLocaleString('en-ZA')}`} accent="rose" />
        <MetricCard label="Reseller Take-Home" value={`R ${metrics.totalResellerTakeHome.toLocaleString('en-ZA')}`} accent="gold" />
        <MetricCard label="Active Tenants" value={`${metrics.activeCount} / ${metrics.totalTenants}`} />
      </div>

      {/* Empty State */}
      {filteredTenants.length === 0 && (
        <div className="flex items-center justify-center min-h-[200px] rounded-xl backdrop-blur-md bg-white/5 border border-white/10 transition-all duration-300 ease-in-out">
          <div className="text-center space-y-2">
            <p className="text-white/40 text-sm font-medium tracking-widest uppercase">
              {categoryFilter !== "all" ? `No ${categoryFilter} tenants found` : "No tenants found"}
            </p>
            <p className="text-white/20 text-xs">
              {categoryFilter !== "all"
                ? "Try selecting a different category from the filters below."
                : "Tenants will appear here once they are linked to this reseller."}
            </p>
          </div>
        </div>
      )}

      {/* Category Filters */}
      {categories.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 transition-all duration-300 ease-in-out">
          <span className="text-[10px] tracking-[0.2em] uppercase text-white/40 font-medium mr-1">
            Filter
          </span>
          <button
            type="button"
            onClick={() => setCategoryFilter("all")}
            className={`px-3 py-1.5 rounded-lg text-[10px] tracking-wider uppercase transition-all duration-200 ease-out ${
              categoryFilter === "all"
                ? "bg-[#00e5ff]/20 border border-[#00e5ff]/40 text-[#00e5ff] hover:scale-[1.01]"
                : "bg-white/[0.03] border border-white/10 text-white/60 hover:bg-white/[0.06] hover:border-white/20 hover:scale-[1.01]"
            }`}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategoryFilter(cat)}
              className={`px-3 py-1.5 rounded-lg text-[10px] tracking-wider uppercase transition-all duration-200 ease-out hover:scale-[1.01] ${
                categoryFilter === cat
                  ? "bg-[#00e5ff]/20 border border-[#00e5ff]/40 text-[#00e5ff]"
                  : "bg-white/[0.03] border border-white/10 text-white/60 hover:bg-white/[0.06] hover:border-white/20"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {/* Tenant Ledger Table */}
      {filteredTenants.length > 0 && (
        <div className="overflow-x-auto rounded-xl backdrop-blur-md bg-white/5 border border-white/10 transition-all duration-300 ease-in-out">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-white/50 text-[10px] tracking-widest uppercase">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Plan</th>
                <th className="px-4 py-3 font-medium">MRR</th>
                <th className="px-4 py-3 font-medium">Revenue</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {filteredTenants.map((tenant, idx) => (
                <tr
                  key={`${tenant.name}-${idx}`}
                  className="border-b border-white/5 text-white/80 hover:bg-white/[0.03] transition-all duration-200 ease-out"
                >
                  <td className="px-4 py-3 font-medium text-white transition-all duration-200">{tenant.name}</td>
                  <td className="px-4 py-3 capitalize">{tenant.plan_tier ?? "—"}</td>
                  <td className="px-4 py-3 font-mono text-[#D4AF37]">
                    {tenant.mrr ? `R ${parseFloat(tenant.mrr).toLocaleString('en-ZA')}` : "—"}
                  </td>
                  <td className="px-4 py-3 font-mono text-[#D4AF37]">
                    {tenant.revenue_total
                      ? `R ${parseFloat(tenant.revenue_total).toLocaleString('en-ZA')}`
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase ${
                        tenant.is_active
                          ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                          : "bg-white/10 text-white/40 border border-white/10"
                      }`}
                    >
                      {tenant.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-white/60">{tenant.email ?? "—"}</td>
                  <td className="px-4 py-3 text-white/40 text-xs">
                    {tenant.created_at ? tenant.created_at.slice(0, 10) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────
// Metric Card Sub-component
// ──────────────────────────────────────────────
function MetricCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "rose" | "gold";
}) {
  const valueColor =
    accent === "rose"
      ? "text-rose-400"
      : accent === "gold"
        ? "text-[#D4AF37]"
        : "text-white";

  return (
    <div className="rounded-xl backdrop-blur-md bg-white/5 border border-white/10 px-5 py-4 space-y-1">
      <p className="text-[10px] tracking-[0.15em] text-white/50 uppercase font-medium">
        {label}
      </p>
      <p className={`text-lg font-bold ${valueColor}`}>{value}</p>
    </div>
  );
}
