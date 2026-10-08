'use client';

/**
 * @file AppointmentsDashboard.tsx
 *
 * Client-side dashboard for viewing and managing AI-captured appointment
 * leads from the public chat widget (tenant_appointments table).
 *
 * Displays a scannable list of LEAD rows with:
 *   - Visitor name, phone, captured date/time, and status badge
 *   - "Mark as Contacted" and "Archive" quick-actions per row
 *   - "View in Chat" deep-link to the Live Chat Inbox on the main dashboard
 *   - Status filter tabs (All / New / Contacted / Archived)
 *   - Periodic auto-refresh (every 30s) + manual refresh
 */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Phone,
  User,
  Calendar,
  RefreshCw,
  MessageSquare,
  CheckCircle,
  Archive,
  Inbox,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────

type StatusFilter = 'ALL' | 'LEAD' | 'CONTACTED' | 'ARCHIVED';

interface AppointmentRow {
  id: string;
  tenant_id: string | null;
  client_name: string | null;
  client_phone: string | null;
  status: string | null;
  start_time: string;
  end_time: string;
  created_at: string | null;
  // Lead-capture columns. The public widget chat pipeline writes an anonymous
  // visitor's name/phone directly into the canonical client_name/client_phone
  // columns during a booking-intent conversation, so the CRM dashboard renders
  // the row immediately. initial_intent records the visitor's stated purpose.
  initial_intent: string | null;
}

interface AppointmentsDashboardProps {
  tenantId: string;
  accessToken?: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────

function formatDateTime(iso: string | null): { date: string; time: string } {
  if (!iso) return { date: '—', time: '' };
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' }),
    time: d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  };
}

function relativeTime(iso: string | null): string {
  if (!iso) return '';
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ── Badge ─────────────────────────────────────────────────────────────────

interface StatusBadgeProps {
  status: string | null;
}

function StatusBadge({ status }: StatusBadgeProps) {
  const s = (status ?? 'LEAD').toUpperCase();

  const styles: Record<string, string> = {
    LEAD: 'bg-cyan-400/10 text-cyan-300 border-cyan-400/20',
    CONTACTED: 'bg-emerald-400/10 text-emerald-300 border-emerald-400/20',
    ARCHIVED: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
    AVAILABLE: 'bg-blue-400/10 text-blue-300 border-blue-400/20',
    RESERVED: 'bg-amber-400/10 text-amber-300 border-amber-400/20',
    CONFIRMED: 'bg-purple-400/10 text-purple-300 border-purple-400/20',
  };

  const labels: Record<string, string> = {
    LEAD: 'New',
    CONTACTED: 'Contacted',
    ARCHIVED: 'Archived',
    AVAILABLE: 'Available',
    RESERVED: 'Reserved',
    CONFIRMED: 'Confirmed',
  };

  const cls = styles[s] ?? 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20';
  const label = labels[s] ?? s;

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-wide font-agrandir ${cls}`}
    >
      {label}
    </span>
  );
}

// ── Row action button ─────────────────────────────────────────────────────

interface ActionButtonProps {
  onClick: () => void;
  disabled?: boolean;
  icon: React.ReactNode;
  label: string;
  variant?: 'primary' | 'ghost';
}

function ActionButton({ onClick, disabled, icon, label, variant = 'ghost' }: ActionButtonProps) {
  const base =
    'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[10px] font-semibold tracking-wide uppercase transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed font-agrandir';
  const styles = {
    primary:
      'bg-cyan-500/15 text-cyan-300 border border-cyan-500/25 hover:bg-cyan-500/25 hover:border-cyan-400/40',
    ghost:
      'bg-white/5 text-zinc-300 border border-white/8 hover:bg-white/10 hover:text-white',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={`${base} ${styles[variant]}`}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────

export function AppointmentsDashboard({ tenantId, accessToken }: AppointmentsDashboardProps) {
  const router = useRouter();
  const [appointments, setAppointments] = useState<AppointmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<StatusFilter>('ALL');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  // ── Fetch ───────────────────────────────────────────────────────────

  const fetchAppointments = useCallback(async (silent = false) => {
    if (!tenantId) return;
    if (!silent) setLoading(true);
    setError(null);

    try {
      const headers: Record<string, string> = {};
      if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

      const res = await fetch(
        `/api/appointments?tenantId=${encodeURIComponent(tenantId)}`,
        { headers },
      );

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Request failed' }));
        throw new Error((body as { error?: string }).error ?? 'Failed to load appointments');
      }

      const data = await res.json() as { appointments: AppointmentRow[] };
      setAppointments(data.appointments ?? []);
      setLastRefreshed(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [tenantId, accessToken]);

  // Initial load
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchAppointments();
  }, [fetchAppointments]);

  // Auto-refresh every 30s
  useEffect(() => {
    const id = setInterval(() => void fetchAppointments(true), 30_000);
    return () => clearInterval(id);
  }, [fetchAppointments]);

  // ── Status update ────────────────────────────────────────────────────

  const updateStatus = useCallback(
    async (id: string, status: 'CONTACTED' | 'ARCHIVED' | 'LEAD') => {
      setUpdatingId(id);
      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

        const res = await fetch('/api/appointments', {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ id, status, tenantId }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({ error: 'Update failed' }));
          throw new Error((body as { error?: string }).error ?? 'Update failed');
        }

        // Optimistic update — no need to re-fetch
        setAppointments((prev) =>
          prev.map((a) => (a.id === id ? { ...a, status } : a)),
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Update failed');
      } finally {
        setUpdatingId(null);
      }
    },
    [tenantId, accessToken],
  );

  // ── Filter + derived state ───────────────────────────────────────────

  const filtered = appointments.filter((a) => {
    if (filter === 'ALL') return true;
    return (a.status ?? 'LEAD').toUpperCase() === filter;
  });

  const counts: Record<StatusFilter, number> = {
    ALL: appointments.length,
    LEAD: appointments.filter((a) => (a.status ?? 'LEAD').toUpperCase() === 'LEAD').length,
    CONTACTED: appointments.filter((a) => a.status?.toUpperCase() === 'CONTACTED').length,
    ARCHIVED: appointments.filter((a) => a.status?.toUpperCase() === 'ARCHIVED').length,
  };

  // ── Render ───────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-5">
      {/* Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-cyan-400 font-agrandir">
            Client Portal
          </p>
          <h1 className="mt-0.5 text-xl font-semibold tracking-tight text-white font-agrandir">
            Appointment Requests
          </h1>
          <p className="mt-0.5 text-xs text-zinc-400 font-agrandir">
            Leads captured by your AI assistant via the public chat widget.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {lastRefreshed && (
            <span className="text-[9px] tracking-widest uppercase text-zinc-500 font-agrandir">
              Updated {relativeTime(lastRefreshed.toISOString())}
            </span>
          )}
          <button
            type="button"
            onClick={() => fetchAppointments()}
            disabled={loading}
            aria-label="Refresh appointments"
            className="flex items-center gap-1.5 rounded-lg border border-white/8 bg-white/5 px-3 py-1.5 text-[10px] uppercase tracking-widest text-zinc-300 hover:bg-white/10 hover:text-white transition-colors disabled:opacity-40 font-agrandir"
          >
            <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} aria-hidden />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Error banner ───────────────────────────────────────────────── */}
      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-xs text-red-300 font-agrandir">
          {error}
        </div>
      )}

      {/* Filter tabs ────────────────────────────────────────────────── */}
      <div
        className="flex gap-1 rounded-xl border border-white/8 bg-slate-950/40 backdrop-blur-md p-1"
        role="tablist"
        aria-label="Filter appointments by status"
      >
        {((['ALL', 'LEAD', 'CONTACTED', 'ARCHIVED'] as const)).map((tab) => {
          const labels: Record<StatusFilter, string> = {
            ALL: 'All',
            LEAD: 'New',
            CONTACTED: 'Contacted',
            ARCHIVED: 'Archived',
          };
          const active = filter === tab;
          return (
            <button
              key={tab}
              role="tab"
              aria-selected={active}
              type="button"
              onClick={() => setFilter(tab)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide transition-all duration-150 font-agrandir ${
                active
                  ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/25'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'
              }`}
            >
              {labels[tab]}
              <span
                className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${
                  active ? 'bg-cyan-400/20 text-cyan-200' : 'bg-white/8 text-zinc-400'
                }`}
              >
                {counts[tab]}
              </span>
            </button>
          );
        })}
      </div>

      {/* Content ────────────────────────────────────────────────────── */}
      {loading && appointments.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-white/8 bg-slate-950/15 backdrop-blur-xl p-12 gap-3">
          <RefreshCw className="h-6 w-6 animate-spin text-cyan-400/50" aria-hidden />
          <p className="text-xs text-zinc-500 font-agrandir">Loading appointment requests…</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-white/8 bg-slate-950/15 backdrop-blur-xl p-12 gap-3">
          <Inbox className="h-8 w-8 text-zinc-600" aria-hidden />
          <p className="text-sm font-semibold text-zinc-400 font-agrandir">
            {filter === 'ALL' ? 'No appointment requests yet' : `No ${filter.toLowerCase()} leads`}
          </p>
          <p className="text-xs text-zinc-600 font-agrandir text-center max-w-xs">
            {filter === 'ALL'
              ? 'Leads will appear here as visitors book via your AI widget.'
              : 'Change the filter above to see other leads.'}
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3" role="list">
          {filtered.map((appt) => {
            const { date, time } = formatDateTime(appt.created_at);
            const isExpanded = expandedId === appt.id;
            const isUpdating = updatingId === appt.id;
            const status = (appt.status ?? 'LEAD').toUpperCase();
            const isArchived = status === 'ARCHIVED';

            return (
              <li
                key={appt.id}
                className={`rounded-2xl border bg-slate-950/15 backdrop-blur-xl transition-all duration-200 ${
                  isArchived
                    ? 'border-white/5 opacity-60'
                    : 'border-white/10 hover:border-white/15'
                }`}
              >
                {/* Row summary ─────────────────────────────────────── */}
                <div className="flex items-center gap-3 px-4 py-3 sm:px-5 sm:py-4">
                  {/* Avatar placeholder */}
                  <div
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5"
                    aria-hidden
                  >
                    <User className="h-4 w-4 text-zinc-400" />
                  </div>

                  {/* Main info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-white font-agrandir truncate">
                        {appt.client_name ?? 'Unknown visitor'}
                      </span>
                      <StatusBadge status={appt.status} />
                    </div>

                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-zinc-500 font-agrandir">
                      {appt.client_phone ? (
                        <span className="flex items-center gap-1">
                          <Phone className="h-2.5 w-2.5" aria-hidden />
                          {appt.client_phone}
                        </span>
                      ) : null}
                      <span className="flex items-center gap-1">
                        <Calendar className="h-2.5 w-2.5" aria-hidden />
                        {date}
                        {time && <span className="text-zinc-600">{time}</span>}
                      </span>
                      <span className="text-zinc-600 italic">{relativeTime(appt.created_at)}</span>
                    </div>
                  </div>

                  {/* Actions + expand toggle */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {/* Mark as Contacted */}
                    {status !== 'CONTACTED' && status !== 'ARCHIVED' && (
                      <ActionButton
                        onClick={() => updateStatus(appt.id, 'CONTACTED')}
                        disabled={isUpdating}
                        icon={<CheckCircle className="h-3 w-3" aria-hidden />}
                        label="Mark contacted"
                        variant="primary"
                      />
                    )}

                    {/* Restore to LEAD */}
                    {status === 'ARCHIVED' && (
                      <ActionButton
                        onClick={() => updateStatus(appt.id, 'LEAD')}
                        disabled={isUpdating}
                        icon={<RefreshCw className="h-3 w-3" aria-hidden />}
                        label="Restore"
                      />
                    )}

{/* View in Chat — links to dashboard with conversation context */}
                      <ActionButton
                        onClick={() => {
                          // Deep-link to the Live Chat Inbox on the main dashboard.
                          // The inbox auto-selects conversations; we pass the phone
                          // as a query hint so the dashboard can pre-filter if desired.
                          // Resolve across both lead-capture (visitor_*) and legacy
                          // slot-booking (client_*) columns.
                          const phone = appt.client_phone;
                          const params = new URLSearchParams();
                          if (phone) params.set('clientPhone', phone);
                          const qs = params.toString();
                          router.push(`/client/dashboard${qs ? `?${qs}` : ''}#live-chat`);
                        }}
                        icon={<MessageSquare className="h-3 w-3" aria-hidden />}
                        label="View in chat"
                      />

                    {/* Archive */}
                    {status !== 'ARCHIVED' && (
                      <ActionButton
                        onClick={() => updateStatus(appt.id, 'ARCHIVED')}
                        disabled={isUpdating}
                        icon={<Archive className="h-3 w-3" aria-hidden />}
                        label="Archive"
                      />
                    )}

                    {/* Expand toggle */}
                    <button
                      type="button"
                      aria-expanded={isExpanded}
                      aria-label={isExpanded ? 'Collapse details' : 'Expand details'}
                      onClick={() => setExpandedId(isExpanded ? null : appt.id)}
                      className="flex items-center justify-center w-7 h-7 rounded-lg border border-white/8 bg-white/5 text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
                    >
                      {isExpanded ? (
                        <ChevronUp className="h-3.5 w-3.5" aria-hidden />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                      )}
                    </button>
                  </div>
                </div>

                {/* Expanded detail row ─────────────────────────────── */}
                {isExpanded && (
                  <div className="border-t border-white/5 px-4 py-3 sm:px-5 sm:pb-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <DetailCell label="Appointment ID" value={appt.id.slice(0, 8) + '…'} />
                    <DetailCell label="Captured" value={`${date} · ${time}`} />
                    <DetailCell label="Status" value={appt.status ?? 'LEAD'} />
                    <DetailCell
                      label="Tenant"
                      value={appt.tenant_id ? appt.tenant_id.slice(0, 8) + '…' : '—'}
                    />
                    <DetailCell
                      label="Visitor intent"
                      value={appt.initial_intent?.trim() || '—'}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* Footer count ───────────────────────────────────────────────── */}
      {filtered.length > 0 && (
        <p className="text-[10px] text-zinc-600 font-agrandir text-center">
          Showing {filtered.length} of {appointments.length} total lead
          {appointments.length !== 1 ? 's' : ''}
        </p>
      )}
    </div>
  );
}

// ── Detail cell helper ────────────────────────────────────────────────────

function DetailCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[9px] uppercase tracking-widest text-zinc-600 font-agrandir">{label}</span>
      <span className="text-xs text-zinc-300 font-agrandir break-all">{value}</span>
    </div>
  );
}
