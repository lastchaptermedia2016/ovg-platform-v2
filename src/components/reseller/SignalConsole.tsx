"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useHannah } from "@/contexts/HannahContext";

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────
interface TenantSummary {
  id: string;
  name: string;
  category: string | null;
}

interface SignalConsoleProps {
  tenants: TenantSummary[];
  resellerSlug: string;
}

interface SignalRow {
  id: string;
  tenant_id: string;
  event_type: string;
  status_code?: string | number | null;
  payload?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  error_type?: string | null;
  created_at: string;
}

interface SignalsResponse {
  success: boolean;
  signals: SignalRow[];
  tenantNames: Record<string, string>;
}

// ──────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────
export function SignalConsole({
  tenants,
  resellerSlug,
}: SignalConsoleProps) {
  const { isRecording, isProcessing, transcript } = useHannah();
  const [signals, setSignals] = useState<SignalRow[]>([]);
  const [tenantNames, setTenantNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Split filtering into two independent tracks:
  // - categoryFilter: business verticals (healthcare, automotive, etc.)
  // - severityFilter: technical log impact (error, critical, all)
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [severityFilter, setSeverityFilter] = useState<string>("all");

  // Active ticker suspension state
  const [isTickerPaused, setIsTickerPaused] = useState(false);

  // Guard against streaming transcript race conditions
  const processedTranscriptRef = useRef<string | null>(null);

  // Derive status text for telemetry header
  const statusText = useMemo(() => {
    if (isTickerPaused) return "TICKER PAUSED";
    if (isProcessing) return "INTERPOLATING STREAM ARRAYS...";
    if (isRecording) return "LISTENING...";
    return "STANDBY";
  }, [isRecording, isProcessing, isTickerPaused]);

  const parseSignalCommand = useCallback((text: string): string | null => {
    const lower = text.toLowerCase();

    // Severity filters (technical impact levels)
    if (lower.includes("filter error")) return "severity:error";
    if (lower.includes("filter critical")) return "severity:critical";
    if (lower.includes("filter standard") || lower.includes("filter all")) return "severity:all";

    // Ticker suspension controls
    if (lower.includes("pause streaming") || lower.includes("pause ticker")) return "pause";
    if (lower.includes("resume streaming") || lower.includes("resume ticker")) return "resume";

    return null;
  }, []);

  // Process transcript with idempotency guard and async-safe state updates
  useEffect(() => {
    if (!transcript || transcript.length === 0) return;

    // Skip if we already processed this exact transcript value
    if (processedTranscriptRef.current === transcript) return;

    const command = parseSignalCommand(transcript);
    if (!command) return;

    processedTranscriptRef.current = transcript;

    let cancelled = false;
    const id = requestAnimationFrame(() => {
      if (cancelled) return;

      switch (command) {
        case "severity:all":
          setSeverityFilter("all");
          break;
        case "severity:error":
          setSeverityFilter("error");
          break;
        case "severity:critical":
          setSeverityFilter("critical");
          break;
        case "pause":
          setIsTickerPaused(true);
          break;
        case "resume":
          setIsTickerPaused(false);
          break;
        default:
          break;
      }
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(id);
    };
  }, [transcript, parseSignalCommand]);

  // Fetch signal data
  useEffect(() => {
    let cancelled = false;

    async function fetchSignals() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/reseller/signals?resellerSlug=${encodeURIComponent(resellerSlug)}`,
        );
        if (!res.ok) throw new Error("Failed to fetch signals");
        const data = (await res.json()) as SignalsResponse;
        if (cancelled) return;
        if (data.success) {
          setSignals(data.signals);
          setTenantNames(data.tenantNames);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unknown error");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void fetchSignals();
    return () => { cancelled = true; };
  }, [resellerSlug]);

  // Derived metrics
  const metrics = useMemo(() => {
    const totalSignals = signals.length;
    const errorSignals = signals.filter(
      (s) => s.error_type === "error" || s.error_type === "critical",
    ).length;
    const healthScore =
      totalSignals > 0
        ? Math.round(((totalSignals - errorSignals) / totalSignals) * 100)
        : 100;

    const uniqueTenantIds = new Set(signals.map((s) => s.tenant_id));
    const leadActivations = uniqueTenantIds.size;

    return {
      signalVolumes: totalSignals,
      leadActivations,
      healthScore,
      errorCount: errorSignals,
    };
  }, [signals]);

  // Business vertical categories (for categoryFilter)
  const categories = useMemo(() => {
    const set = new Set<string>();
    signals.forEach((s) => {
      const tenant = tenants.find((t) => t.id === s.tenant_id);
      if (tenant?.category) set.add(tenant.category);
    });
    return Array.from(set).sort();
  }, [signals, tenants]);

  // Conjunctive filtering: category (vertical) AND severity (impact level)
  const filteredSignals = useMemo(() => {
    let base = signals;

    // Apply category filter (business vertical)
    if (categoryFilter !== "all") {
      base = base.filter((s) => {
        const tenant = tenants.find((t) => t.id === s.tenant_id);
        return tenant?.category === categoryFilter;
      });
    }

    // Apply severity filter (technical impact)
    if (severityFilter !== "all") {
      base = base.filter((s) => s.error_type === severityFilter);
    }

    return base;
  }, [signals, categoryFilter, severityFilter, tenants]);

  const getStatusColor = (signal: SignalRow): string => {
    if (signal.error_type === "critical" || signal.error_type === "error")
      return "text-red-400";
    if (signal.status_code === 200 || signal.status_code === "200")
      return "text-emerald-400";
    if (String(signal.status_code ?? "").startsWith("4") || String(signal.status_code ?? "").startsWith("5"))
      return "text-amber-400";
    return "text-white/60";
  };

  const toggleExpand = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  return (
    <div className="w-full space-y-6 transition-all duration-300 ease-in-out">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-xl font-bold text-[#00e5ff] tracking-tight uppercase drop-shadow-[0_0_8px_rgba(0,229,255,0.4)] flex items-center gap-3">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00e5ff] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#00e5ff]"></span>
            </span>
            Signal Telemetry
          </h1>
          <span className={`text-[10px] tracking-[0.2em] uppercase font-bold transition-all duration-300 ease-in-out ${
            isRecording || isProcessing || isTickerPaused
              ? "text-[#00e5ff] drop-shadow-[0_0_8px_rgba(0,229,255,0.4)]"
              : "text-white/60"
          }`}>
            {statusText}
          </span>
        </div>
        <p className="text-sm text-white/50 mt-1">
          Operational signals and system health for{" "}
          {tenants.length} client{tenants.length !== 1 ? "s" : ""}.
        </p>
      </div>

      {/* Category Filters (Business Verticals) */}
      {categories.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] tracking-[0.2em] uppercase text-white/40 font-medium mr-1">
            Category
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

      {/* Severity Filters (Technical Impact) */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] tracking-[0.2em] uppercase text-white/40 font-medium mr-1">
          Severity
        </span>
        <button
          type="button"
          onClick={() => setSeverityFilter("all")}
          className={`px-3 py-1.5 rounded-lg text-[10px] tracking-wider uppercase transition-all duration-200 ease-out ${
            severityFilter === "all"
              ? "bg-[#00e5ff]/20 border border-[#00e5ff]/40 text-[#00e5ff] hover:scale-[1.01]"
              : "bg-white/[0.03] border border-white/10 text-white/60 hover:bg-white/[0.06] hover:border-white/20 hover:scale-[1.01]"
          }`}
        >
          All
        </button>
        <button
          type="button"
          onClick={() => setSeverityFilter("error")}
          className={`px-3 py-1.5 rounded-lg text-[10px] tracking-wider uppercase transition-all duration-200 ease-out hover:scale-[1.01] ${
            severityFilter === "error"
              ? "bg-[#00e5ff]/20 border border-[#00e5ff]/40 text-[#00e5ff]"
              : "bg-white/[0.03] border border-white/10 text-white/60 hover:bg-white/[0.06] hover:border-white/20"
          }`}
        >
          Error
        </button>
        <button
          type="button"
          onClick={() => setSeverityFilter("critical")}
          className={`px-3 py-1.5 rounded-lg text-[10px] tracking-wider uppercase transition-all duration-200 ease-out hover:scale-[1.01] ${
            severityFilter === "critical"
              ? "bg-[#00e5ff]/20 border border-[#00e5ff]/40 text-[#00e5ff]"
              : "bg-white/[0.03] border border-white/10 text-white/60 hover:bg-white/[0.06] hover:border-white/20"
          }`}
        >
          Critical
        </button>
      </div>

      {/* Metric Widgets */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-xl backdrop-blur-md bg-white/5 border border-white/10 px-5 py-4">
          <p className="text-[10px] tracking-[0.15em] text-white/50 uppercase font-medium">
            Signal Volumes
          </p>
          <p className="text-2xl font-bold text-[#0097b2] mt-1">
            {loading ? (
              <span className="animate-pulse text-white/20">---</span>
            ) : (
              metrics.signalVolumes.toLocaleString()
            )}
          </p>
          <p className="text-[10px] text-white/30 mt-1">Total events recorded</p>
        </div>

        <div className="rounded-xl backdrop-blur-md bg-white/5 border border-white/10 px-5 py-4">
          <p className="text-[10px] tracking-[0.15em] text-white/50 uppercase font-medium">
            Lead Activations
          </p>
          <p className="text-2xl font-bold text-[#D4AF37] mt-1">
            {loading ? (
              <span className="animate-pulse text-white/20">---</span>
            ) : (
              metrics.leadActivations.toLocaleString()
            )}
          </p>
          <p className="text-[10px] text-white/30 mt-1">Active tenants with signals</p>
        </div>

        <div className="rounded-xl backdrop-blur-md bg-white/5 border border-white/10 px-5 py-4">
          <p className="text-[10px] tracking-[0.15em] text-white/50 uppercase font-medium">
            Health Status
          </p>
          <p className={`text-2xl font-bold mt-1 ${
            loading
              ? "text-white/20"
              : metrics.healthScore >= 95
                ? "text-emerald-400"
                : metrics.healthScore >= 80
                  ? "text-amber-400"
                  : "text-red-400"
          }`}>
            {loading ? (
              <span className="animate-pulse">---</span>
            ) : (
              `${metrics.healthScore}%`
            )}
          </p>
          <p className="text-[10px] text-white/30 mt-1">
            {metrics.errorCount > 0
              ? `${metrics.errorCount} error${metrics.errorCount !== 1 ? "s" : ""} detected`
              : "All systems nominal"}
          </p>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="rounded-xl backdrop-blur-md bg-red-500/10 border border-red-500/20 px-5 py-4">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* Signal List */}
      <div className="rounded-xl backdrop-blur-md bg-white/5 border border-white/10 overflow-hidden">
        {/* Table Header */}
        <div className="grid grid-cols-4 gap-4 px-5 py-3 border-b border-white/10 text-[10px] tracking-[0.2em] uppercase text-white/40 font-medium">
          <span>Timestamp</span>
          <span>Tenant</span>
          <span>Event Type</span>
          <span>Status</span>
        </div>

        {/* Loading */}
        {loading && (
          <div className="px-5 py-8 text-center">
            <div className="inline-flex items-center gap-2 text-white/40 text-xs">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              {isTickerPaused ? "Ticker suspended" : "Loading signals..."}
            </div>
          </div>
        )}

        {/* Empty */}
        {!loading && filteredSignals.length === 0 && !error && (
          <div className="px-5 py-8 text-center">
            <p className="text-white/40 text-sm font-medium tracking-widest uppercase">
              No signals found
            </p>
            <p className="text-white/20 text-xs mt-1">
              {isTickerPaused
                ? "Streaming is paused. Resume to ingest new telemetry."
                : "Telemetry data will appear once events are triggered."}
            </p>
          </div>
        )}

        {/* Signal Rows */}
        {!loading &&
          filteredSignals.map((signal) => {
            const isExpanded = expandedId === signal.id;
            return (
              <div key={signal.id}>
                <button
                  type="button"
                  onClick={() => toggleExpand(signal.id)}
                  className="w-full grid grid-cols-4 gap-4 px-5 py-3 text-left text-sm border-b border-white/5 hover:bg-white/[0.03] transition-all duration-200 ease-out"
                >
                  <span className="text-white/40 text-xs">
                    {signal.created_at.slice(0, 16).replace("T", " ")}
                  </span>
                  <span className="text-white/80 font-medium truncate">
                    {tenantNames[signal.tenant_id] ?? signal.tenant_id.slice(0, 8)}
                  </span>
                  <span className="text-white/80 capitalize">
                    {(signal.event_type ?? "unknown").replace(/_/g, " ")}
                  </span>
                  <span className={getStatusColor(signal)}>
                    {signal.error_type
                      ? signal.error_type.toUpperCase()
                      : signal.status_code ?? "—"}
                  </span>
                </button>

                {/* Expandable JSON Drawer */}
                {isExpanded && (
                  <div className="px-5 py-4 bg-slate-950 border-b border-white/5">
                    <pre className="font-mono text-xs text-emerald-400 whitespace-pre-wrap break-all leading-relaxed max-h-64 overflow-y-auto">
                      {JSON.stringify(
                        {
                          id: signal.id,
                          tenant_id: signal.tenant_id,
                          event_type: signal.event_type,
                          status_code: signal.status_code,
                          error_type: signal.error_type,
                          payload: signal.payload,
                          metadata: signal.metadata,
                          created_at: signal.created_at,
                        },
                        null,
                        2,
                      )}
                    </pre>
                  </div>
                )}
              </div>
            );
          })}
      </div>
    </div>
  );
}