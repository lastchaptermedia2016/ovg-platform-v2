"use client";

import { useMemo } from "react";
import Link from "next/link";
import { calculateResellerSplits } from "@/config/pricing";

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

      {/* Metric Cards — Tier-Aware 50/50 Split View */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard label="Gross MRR" value={`R ${metrics.totalGrossMrr.toLocaleString()}`} />
        <MetricCard label="Wholesale Cost" value={`R ${metrics.totalWholesaleCost.toLocaleString()}`} accent="rose" />
        <MetricCard label="Reseller Take-Home" value={`R ${metrics.totalResellerTakeHome.toLocaleString()}`} accent="gold" />
        <MetricCard label="Active Tenants" value={`${metrics.activeCount} / ${metrics.totalTenants}`} />
      </div>

      {/* Empty State */}
      {initialTenants.length === 0 && (
        <div className="flex items-center justify-center min-h-[200px] rounded-xl backdrop-blur-md bg-white/5 border border-white/10">
          <div className="text-center space-y-2">
            <p className="text-white/40 text-sm font-medium tracking-widest uppercase">
              No tenants found
            </p>
            <p className="text-white/20 text-xs">
              Tenants will appear here once they are linked to this reseller.
            </p>
          </div>
        </div>
      )}

      {/* Tenant Ledger Table */}
      {initialTenants.length > 0 && (
        <div className="overflow-x-auto rounded-xl backdrop-blur-md bg-white/5 border border-white/10">
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
              {initialTenants.map((tenant, idx) => (
                <tr
                  key={`${tenant.name}-${idx}`}
                  className="border-b border-white/5 text-white/80 hover:bg-white/[0.03] transition-colors"
                >
                  <td className="px-4 py-3 font-medium text-white">{tenant.name}</td>
                  <td className="px-4 py-3 capitalize">{tenant.plan_tier ?? "—"}</td>
                  <td className="px-4 py-3 font-mono text-[#D4AF37]">
                    {tenant.mrr ? `R ${parseFloat(tenant.mrr).toLocaleString()}` : "—"}
                  </td>
                  <td className="px-4 py-3 font-mono text-[#D4AF37]">
                    {tenant.revenue_total
                      ? `R ${parseFloat(tenant.revenue_total).toLocaleString()}`
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
