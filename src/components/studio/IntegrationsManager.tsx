'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import {
  CalendarCheck,
  Boxes,
  Contact,
  BrainCircuit,
  MessageSquare,
  Check,
  Plug,
  Sparkles,
  UploadCloud,
  X,
  Link2,
  KeyRound,
  Loader2,
  AlertCircle,
} from 'lucide-react';

export interface IntegrationsManagerProps {
  /** If provided, manages this specific client (reseller managed-service model). */
  targetClientId?: string;
  /** Dictates which API routes to call. */
  role: 'client' | 'reseller';
}

type IntegrationStatus = 'active' | 'configure' | 'premium';

interface Integration {
  id: string;
  name: string;
  tagline: string;
  description: string;
  icon: typeof CalendarCheck;
  accent: string;
  status: IntegrationStatus;
  cta: string;
}

type IntegrationConfigState = Record<string, unknown> & {
  enabled?: boolean;
  calendarLink?: string;
  bookingWindow?: string;
  inventoryApi?: string;
  syncFrequency?: string;
  crmProvider?: string;
  crmApiKey?: string | { isConfigured: boolean };
  crmPushCadence?: string;
  vectorSources?: string[];
  messagingChannel?: string;
  twilioAuthToken?: string | { isConfigured: boolean };
  businessPhone?: string;
};

const BLANK_CONFIG: IntegrationConfigState = { enabled: false };

const INTEGRATIONS: Integration[] = [
  {
    id: 'smart-booking',
    name: 'Smart Booking',
    tagline: 'Calendly · Scheduling',
    description: 'Let the AI concierge book appointments directly into your calendar.',
    icon: CalendarCheck,
    accent: 'from-emerald-500/20 to-teal-500/10 border-emerald-500/30 text-emerald-300',
    status: 'active',
    cta: 'Configure',
  },
  {
    id: 'live-inventory',
    name: 'Live Inventory',
    tagline: 'Catalog · Real-time',
    description: 'Surface live stock and product availability inside every conversation.',
    icon: Boxes,
    accent: 'from-amber-500/20 to-orange-500/10 border-amber-500/30 text-amber-300',
    status: 'active',
    cta: 'Configure',
  },
  {
    id: 'crm-sync',
    name: 'CRM Lead Sync',
    tagline: 'HubSpot · Salesforce',
    description: 'Auto-push qualified leads and transcripts into your CRM pipeline.',
    icon: Contact,
    accent: 'from-sky-500/20 to-blue-500/10 border-sky-500/30 text-sky-300',
    status: 'premium',
    cta: 'Connect',
  },
  {
    id: 'vector-kb',
    name: 'Vector Knowledge-Base',
    tagline: 'RAG · Document sync',
    description: 'Train the assistant on your manuals, policies, and FAQs via embeddings.',
    icon: BrainCircuit,
    accent: 'from-violet-500/20 to-fuchsia-500/10 border-violet-500/30 text-violet-300',
    status: 'premium',
    cta: 'Configure',
  },
  {
    id: 'whatsapp-sms',
    name: 'WhatsApp / SMS',
    tagline: 'Twilio · Messaging',
    description: 'Hand off conversations to WhatsApp or SMS without losing context.',
    icon: MessageSquare,
    accent: 'from-green-500/20 to-emerald-500/10 border-green-500/30 text-green-300',
    status: 'configure',
    cta: 'Connect',
  },
];

interface IntegrationPricing {
  setupUsd: number;
  setupZar: number;
  monthlyUsd: number;
  monthlyZar: number;
}

/**
 * Official once-off setup and monthly recurring pricing for each integration,
 * expressed in both USD ($) and ZAR (R). Keyed by integration id so the grid
 * can render the correct banner per card.
 */
const INTEGRATION_PRICING: Record<string, IntegrationPricing> = {
  'smart-booking': { setupUsd: 199, setupZar: 3250, monthlyUsd: 39, monthlyZar: 640 },
  'live-inventory': { setupUsd: 299, setupZar: 4900, monthlyUsd: 69, monthlyZar: 1130 },
  'crm-sync': { setupUsd: 149, setupZar: 2450, monthlyUsd: 29, monthlyZar: 480 },
  'vector-kb': { setupUsd: 249, setupZar: 4100, monthlyUsd: 49, monthlyZar: 800 },
  'whatsapp-sms': { setupUsd: 149, setupZar: 2450, monthlyUsd: 39, monthlyZar: 640 },
};

const INTEGRATION_THEMES: Record<
  string,
  {
    gradient: string;
    border: string;
    text: string;
    panel: string;
    iconBg: string;
    iconText: string;
    inputFocus: string;
    success: string;
    cta: string;
    ctaHover: string;
    dragOver: string;
    dragBase: string;
    statusBadge: string;
    glassGradient: string;
    glow: string;
  }
> = {
  'smart-booking': {
    gradient: 'from-emerald-500/20 to-teal-500/10',
    border: 'border-emerald-500/40',
    text: 'text-emerald-150',
    panel: 'bg-emerald-950/90',
    iconBg: 'bg-emerald-500/10 border-emerald-500/20',
    iconText: 'text-emerald-300',
    inputFocus: 'focus:border-emerald-500',
    success: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-200',
    cta: 'from-emerald-600 to-teal-500',
    ctaHover: 'hover:from-emerald-500 hover:to-teal-400',
    dragOver: 'border-emerald-400/60 bg-emerald-500/10',
    dragBase: 'border-white/15 bg-slate-900/40',
    statusBadge: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30',
    glassGradient: 'from-emerald-500/15 via-teal-950/40 to-slate-950/80',
    glow: 'shadow-2xl shadow-emerald-950/50',
  },
  'live-inventory': {
    gradient: 'from-amber-500/20 to-orange-500/10',
    border: 'border-amber-500/40',
    text: 'text-amber-150',
    panel: 'bg-amber-950/90',
    iconBg: 'bg-amber-500/10 border-amber-500/20',
    iconText: 'text-amber-300',
    inputFocus: 'focus:border-amber-500',
    success: 'bg-amber-500/15 border-amber-500/30 text-amber-200',
    cta: 'from-amber-600 to-orange-500',
    ctaHover: 'hover:from-amber-500 hover:to-orange-400',
    dragOver: 'border-amber-400/60 bg-amber-500/10',
    dragBase: 'border-white/15 bg-slate-900/40',
    statusBadge: 'bg-amber-500/15 text-amber-300 border border-amber-500/30',
    glassGradient: 'from-amber-500/15 via-orange-950/40 to-slate-950/80',
    glow: 'shadow-2xl shadow-amber-950/50',
  },
  'crm-sync': {
    gradient: 'from-sky-500/20 to-blue-500/10',
    border: 'border-sky-500/40',
    text: 'text-blue-150',
    panel: 'bg-blue-950/90',
    iconBg: 'bg-sky-500/10 border-sky-500/20',
    iconText: 'text-sky-300',
    inputFocus: 'focus:border-sky-500',
    success: 'bg-sky-500/15 border-sky-500/30 text-sky-200',
    cta: 'from-sky-600 to-blue-500',
    ctaHover: 'hover:from-sky-500 hover:to-blue-400',
    dragOver: 'border-sky-400/60 bg-sky-500/10',
    dragBase: 'border-white/15 bg-slate-900/40',
    statusBadge: 'bg-sky-500/15 text-sky-300 border border-sky-500/30',
    glassGradient: 'from-sky-500/15 via-blue-950/40 to-slate-950/80',
    glow: 'shadow-2xl shadow-sky-950/50',
  },
  'vector-kb': {
    gradient: 'from-violet-500/20 to-fuchsia-500/10',
    border: 'border-violet-500/40',
    text: 'text-purple-150',
    panel: 'bg-purple-950/90',
    iconBg: 'bg-violet-500/10 border-violet-500/20',
    iconText: 'text-violet-300',
    inputFocus: 'focus:border-violet-500',
    success: 'bg-violet-500/15 border-violet-500/30 text-violet-200',
    cta: 'from-violet-600 to-fuchsia-500',
    ctaHover: 'hover:from-violet-500 hover:to-fuchsia-400',
    dragOver: 'border-violet-400/60 bg-violet-500/10',
    dragBase: 'border-white/15 bg-slate-900/40',
    statusBadge: 'bg-violet-500/15 text-violet-300 border border-violet-500/30',
    glassGradient: 'from-violet-500/15 via-fuchsia-950/40 to-slate-950/80',
    glow: 'shadow-2xl shadow-violet-950/50',
  },
  'whatsapp-sms': {
    gradient: 'from-green-500/20 to-emerald-500/10',
    border: 'border-green-500/40',
    text: 'text-teal-150',
    panel: 'bg-teal-950/90',
    iconBg: 'bg-green-500/10 border-green-500/20',
    iconText: 'text-green-300',
    inputFocus: 'focus:border-green-500',
    success: 'bg-green-500/15 border-green-500/30 text-green-200',
    cta: 'from-green-600 to-emerald-500',
    ctaHover: 'hover:from-green-500 hover:to-emerald-400',
    dragOver: 'border-green-400/60 bg-green-500/10',
    dragBase: 'border-white/15 bg-slate-900/40',
    statusBadge: 'bg-green-500/15 text-green-300 border border-green-500/30',
    glassGradient: 'from-green-500/15 via-emerald-950/40 to-slate-950/80',
    glow: 'shadow-2xl shadow-green-950/50',
  },
};

const STATUS_META: Record<IntegrationStatus, { label: string; className: string }> = {
  active: { label: 'Active', className: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30' },
  configure: { label: 'Configure', className: 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30' },
  premium: { label: 'Premium Add-on', className: 'bg-amber-500/15 text-amber-300 border border-amber-500/30' },
};

/**
 * Color palette for each integration card - unique vibrant shade per integration
 * Each color uses higher saturation for clear visual distinction
 */
const INTEGRATION_COLOR_MAP: Record<string, { from: string; to: string }> = {
  'smart-booking': {
    from: 'rgba(0, 200, 255, 0.20)',    // Bright Cyan/Sky Blue
    to: 'rgba(0, 150, 200, 0.10)',
  },
  'live-inventory': {
    from: 'rgba(255, 150, 0, 0.20)',    // Bright Orange
    to: 'rgba(255, 100, 0, 0.10)',
  },
  'crm-sync': {
    from: 'rgba(255, 80, 120, 0.20)',   // Bright Red/Coral
    to: 'rgba(255, 50, 80, 0.10)',
  },
  'vector-kb': {
    from: 'rgba(200, 100, 255, 0.20)',  // Bright Magenta/Purple
    to: 'rgba(150, 50, 255, 0.10)',
  },
  'whatsapp-sms': {
    from: 'rgba(0, 255, 150, 0.20)',    // Bright Teal/Mint
    to: 'rgba(0, 200, 100, 0.10)',
  },
};

function secretDisplayValue(v: unknown): string {
  if (v && typeof v === 'object' && 'isConfigured' in (v as Record<string, unknown>)) {
    return '';
  }
  return typeof v === 'string' ? v : '';
}

function isConfigured(v: unknown): boolean {
  return Boolean(v && typeof v === 'object' && (v as { isConfigured?: boolean }).isConfigured);
}

export function IntegrationsManager({ targetClientId, role }: IntegrationsManagerProps) {
  const [configs, setConfigs] = useState<Record<string, IntegrationConfigState>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const isFetchingRef = useRef(false);

  const apiBase =
    role === 'reseller' ? '/api/reseller/manage-client-integrations' : '/api/client/integrations';

  const active = INTEGRATIONS.find((i) => i.id === activeId) ?? null;

  const fetchIntegrations = useCallback(async () => {
    if (document.hidden || isFetchingRef.current) return;

    isFetchingRef.current = true;
    try {
      const url =
        role === 'reseller' && targetClientId
          ? `${apiBase}?targetClientId=${encodeURIComponent(targetClientId)}`
          : apiBase;
      const res = await fetch(url, { method: 'GET' });
      if (!res.ok) return;
      const data = await res.json();
      const incoming = (data.integrations ?? {}) as Record<string, IntegrationConfigState>;
      setConfigs((prev) => {
        const merged: Record<string, IntegrationConfigState> = { ...prev };
        for (const item of INTEGRATIONS) {
          merged[item.id] = { ...BLANK_CONFIG, ...(incoming[item.id] ?? {}) };
        }
        return merged;
      });
    } catch {
      // Non-fatal: fall back to blank forms.
    } finally {
      isFetchingRef.current = false;
    }
  }, [apiBase, role, targetClientId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await fetchIntegrations();
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchIntegrations]);

  const updateField = (integrationId: string, key: string, value: unknown) => {
    setConfigs((prev) => ({
      ...prev,
      [integrationId]: { ...(prev[integrationId] ?? BLANK_CONFIG), [key]: value },
    }));
  };

  const handleSave = async () => {
    if (!active) return;
    const cfg = configs[active.id] ?? BLANK_CONFIG;
    setSavingId(active.id);
    setStatus(null);
    try {
      const payload: Record<string, unknown> = { ...cfg };
      payload.enabled = true;
      if (typeof payload.crmApiKey === 'string' && payload.crmApiKey.trim() === '') {
        delete payload.crmApiKey;
      }
      if (typeof payload.twilioAuthToken === 'string' && payload.twilioAuthToken.trim() === '') {
        delete payload.twilioAuthToken;
      }

      const body =
        role === 'reseller' && targetClientId
          ? { targetClientId, integrationId: active.id, config: payload }
          : { integrationId: active.id, config: payload };

      const res = await fetch(apiBase, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }

      setStatus({ type: 'success', message: `${active.name} saved successfully.` });
      window.setTimeout(() => {
        setActiveId(null);
        setStatus(null);
      }, 1100);
    } catch (err) {
      setStatus({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to save configuration',
      });
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="w-full rounded-2xl border border-white/10 bg-slate-950/15 backdrop-blur-xl p-4 sm:p-6">
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <Plug className="h-4 w-4 text-cyan-400" />
          <h2 className="text-sm font-medium text-white font-agrandir">Integrations</h2>
        </div>
        <p className="text-xs text-zinc-400 font-agrandir mt-1">
          Connect premium add-ons to extend your AI concierge with booking, commerce, CRM, and knowledge capabilities.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-zinc-400 text-sm gap-2">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading integrations…
        </div>
      ) : (
        <div className="grid gap-4 items-start w-full" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
          {INTEGRATIONS.map((item) => {
            const Icon = item.icon;
            const statusMeta = STATUS_META[item.status];
            const cfg = configs[item.id] ?? BLANK_CONFIG;
            const configured =
              cfg.enabled ||
              isConfigured(cfg.crmApiKey) ||
              isConfigured(cfg.twilioAuthToken) ||
              Boolean(cfg.calendarLink || cfg.inventoryApi || cfg.crmProvider || cfg.messagingChannel);
            return (
              <div
                key={item.id}
                className="group relative flex flex-col rounded-3xl border border-white/10 backdrop-blur-xl shadow-2xl transition-all duration-200 hover:border-white/20 hover:shadow-[0_20px_50px_rgba(0,0,0,0.35)] w-full overflow-visible"
                style={{
                  background: `linear-gradient(135deg, ${INTEGRATION_COLOR_MAP[item.id].from}, ${INTEGRATION_COLOR_MAP[item.id].to})`,
                }}
              >
                <div className="px-6 pt-7 pb-6 flex flex-col gap-4 w-full">
                  <div className="flex items-start justify-between w-full gap-2">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/5 border border-white/10 shrink-0">
                      <Icon className="h-5 w-5" />
                    </div>
                    <span
                      className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-[9px] tracking-widest uppercase font-semibold shrink-0 ${statusMeta.className}`}
                    >
                      {statusMeta.label}
                    </span>
                  </div>

                  <div className="flex flex-col gap-3 flex-grow w-full">
                    <div className="w-full">
                      <h3 className="text-base font-bold tracking-tight text-white font-agrandir break-words hyphens-auto">
                        {item.name}
                      </h3>
                      <p className="text-[10px] tracking-wider text-white/50 uppercase mt-0.5 break-words hyphens-auto">
                        {item.tagline}
                      </p>
                    </div>
                    <p className="text-xs leading-5 text-zinc-300/80 break-words whitespace-normal hyphens-auto">
                      {item.description}
                    </p>

                    {INTEGRATION_PRICING[item.id] && (
                      (() => {
                        const p = INTEGRATION_PRICING[item.id];
                        return (
                          <div className="space-y-2 bg-black/30 border border-white/5 rounded-2xl p-3.5 text-xs text-slate-300">
                            <div className="space-y-1">
                              <div className="font-medium">Once-off:</div>
                              <div className="flex flex-wrap gap-1 text-white">
                                <span>${p.setupUsd}</span>
                                <span>/</span>
                                <span>R{p.setupZar.toLocaleString('en-ZA')}</span>
                              </div>
                            </div>
                            <div className="space-y-1">
                              <div className="font-medium">Monthly:</div>
                              <div className="flex flex-wrap gap-1 text-white">
                                <span>${p.monthlyUsd}</span>
                                <span>/</span>
                                <span>R{p.monthlyZar.toLocaleString('en-ZA')}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })()
                    )}

                    {configured && (
                      <p className="inline-flex items-center gap-1 text-[10px] text-emerald-300">
                        <Check className="h-3 w-3" /> Connected
                      </p>
                    )}
                  </div>

                  <div className="mt-auto">
                    <button
                      onClick={() => setActiveId(item.id)}
                      className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-white/10 hover:bg-white/20 border border-white/10 hover:border-white/25 text-white text-xs font-medium py-2.5 transition-all duration-200 min-h-[44px]"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      {item.cta}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Slide-over configuration drawer */}
      {active && (() => {
        const theme = INTEGRATION_THEMES[active.id] ?? INTEGRATION_THEMES['smart-booking'];
        const cardColors = INTEGRATION_COLOR_MAP[active.id];
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4"
            role="dialog"
            aria-modal="true"
            aria-label={`${active.name} configuration`}
          >
            <button
              type="button"
              aria-label="Close configuration"
              onClick={() => {
                setActiveId(null);
                setStatus(null);
              }}
              className="absolute inset-0"
            />
            <div 
              className={`relative w-full max-w-md max-h-[85vh] overflow-y-auto rounded-2xl border shadow-2xl backdrop-blur-2xl p-6 sm:p-7`}
              style={{
                background: `linear-gradient(135deg, ${cardColors.from.replace('0.20', '0.35')}, ${cardColors.to.replace('0.10', '0.15')}), rgba(10, 15, 30, 0.7)`,
                backgroundBlendMode: 'screen',
                borderColor: cardColors.from,
              }}
            >
              <div className="flex items-start justify-between gap-3 mb-6">
                <div className="flex items-center gap-3">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl border ${theme.iconBg}`}>
                    <active.icon className={`h-5 w-5 ${theme.iconText}`} />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-white font-agrandir">{active.name}</h3>
                    <p className="text-[10px] uppercase tracking-wider text-white/40">{active.tagline}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setActiveId(null);
                    setStatus(null);
                  }}
                  aria-label="Close"
                  className="flex items-center justify-center w-9 h-9 rounded-lg text-zinc-400 hover:bg-white/5 hover:text-white transition-colors shrink-0"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <p className="text-xs text-zinc-400 mb-6">{active.description}</p>

              <IntegrationConfigForm
                integration={active}
                config={configs[active.id] ?? BLANK_CONFIG}
                theme={theme}
                onField={(key, value) => updateField(active.id, key, value)}
              />

              {status && (
                <div
                  className={`mt-5 p-3 rounded-lg flex items-center gap-2 text-xs ${theme.success}`}
                  role="alert"
                >
                  {status.type === 'error' && <AlertCircle className="h-4 w-4 shrink-0" />}
                  {status.message}
                </div>
              )}

              <div className="flex flex-col-reverse sm:flex-row items-center justify-end gap-3 pt-4 border-t border-white/10">
                <button
                  onClick={() => {
                    setActiveId(null);
                    setStatus(null);
                  }}
                  className="px-5 py-2.5 rounded-lg border border-white/10 text-zinc-300 hover:bg-white/5 text-sm font-medium transition-colors min-h-[44px]"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={savingId === active.id}
                  aria-busy={savingId === active.id}
                  className={`px-5 py-2.5 rounded-lg bg-gradient-to-r ${theme.cta} ${theme.ctaHover} text-white font-semibold text-sm transition-all duration-200 shadow-lg min-h-[44px] disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2`}
                >
                  {savingId === active.id ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Saving…
                    </>
                  ) : (
                    'Save Configuration'
                  )}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function IntegrationConfigForm({
  integration,
  config,
  theme,
  onField,
}: {
  integration: Integration;
  config: IntegrationConfigState;
  theme: {
    gradient: string;
    border: string;
    text: string;
    panel: string;
    iconBg: string;
    iconText: string;
    inputFocus: string;
    success: string;
    cta: string;
    ctaHover: string;
    dragOver: string;
    dragBase: string;
    statusBadge: string;
    glassGradient: string;
    glow: string;
  };
  onField: (key: string, value: unknown) => void;
}) {
  const [files, setFiles] = useState<string[]>([]);
  const [dragOver, setDragOver] = useState(false);

  const value = (key: string, fallback = ''): string => {
    const v = config[key];
    if (typeof v === 'string') return v;
    if (key === 'crmApiKey' || key === 'twilioAuthToken') return secretDisplayValue(v);
    return fallback;
  };

  switch (integration.id) {
    case 'smart-booking':
      return (
        <div className="space-y-5">
          <ConfigField
            icon={Link2}
            label="Calendly / Calendar Link"
            value={value('calendarLink')}
            placeholder="https://calendly.com/your-business/discovery"
            hint="The AI will use this link to schedule qualified appointments."
            onChange={(v) => onField('calendarLink', v)}
          />
          <ConfigSelect
            label="Booking Window"
            value={config.bookingWindow as string}
            options={['Business hours', '24/7', 'Weekdays only']}
            onChange={(v) => onField('bookingWindow', v)}
          />
        </div>
      );
    case 'crm-sync':
      return (
        <div className="space-y-5">
          <ConfigSelect
            label="CRM Provider"
            value={config.crmProvider as string}
            options={['HubSpot', 'Salesforce', 'Pipedrive', 'Zoho']}
            onChange={(v) => onField('crmProvider', v)}
          />
          <ConfigField
            icon={KeyRound}
            label="API Key"
            type="password"
            value={value('crmApiKey')}
            placeholder={isConfigured(config.crmApiKey) ? '•••••••• (already set)' : 'pat-xxxxx-xxxxx'}
            hint="Stored encrypted. Never shared with the model context. Leave blank to keep the existing key."
            onChange={(v) => onField('crmApiKey', v)}
          />
          <ConfigSelect
            label="Push Cadence"
            value={config.crmPushCadence as string}
            options={['Realtime', 'Every 15 min', 'Daily batch']}
            onChange={(v) => onField('crmPushCadence', v)}
          />
        </div>
      );
    case 'vector-kb':
      return (
        <div className="space-y-5">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const names = Array.from(e.dataTransfer.files).map((f) => f.name);
              setFiles((prev) => [...prev, ...names]);
            }}
            className={`rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
              dragOver ? theme.dragOver : theme.dragBase
            }`}
          >
            <UploadCloud className="h-7 w-7 mx-auto text-cyan-400 mb-2" />
            <p className="text-sm text-white/80">Drag &amp; drop PDFs, DOCX, or TXT</p>
            <p className="text-xs text-zinc-500 mt-1">or click to browse · up to 50 MB each</p>
          </div>
          {files.length > 0 && (
            <ul className="space-y-1">
              {files.map((f) => (
                <li
                  key={f}
                  className="flex items-center gap-2 text-xs text-zinc-300 bg-white/5 border border-white/10 rounded-lg px-3 py-2"
                >
                  <Check className={`h-3.5 w-3.5 shrink-0 ${theme.iconText}`} />
                  <span className="truncate">{f}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      );
    case 'live-inventory':
      return (
        <div className="space-y-5">
          <ConfigField
            icon={Link2}
            label="Catalog / Inventory API"
            value={value('inventoryApi')}
            placeholder="https://api.your-store.com/v1/products"
            hint="Polled in real time to answer stock and pricing questions."
            onChange={(v) => onField('inventoryApi', v)}
          />
          <ConfigSelect
            label="Sync Frequency"
            value={config.syncFrequency as string}
            options={['Every 5 min', 'Every 30 min', 'Hourly']}
            onChange={(v) => onField('syncFrequency', v)}
          />
        </div>
      );
    case 'whatsapp-sms':
      return (
        <div className="space-y-5">
          <ConfigSelect
            label="Channel"
            value={config.messagingChannel as string}
            options={['WhatsApp', 'SMS', 'Both']}
            onChange={(v) => onField('messagingChannel', v)}
          />
          <ConfigField
            icon={KeyRound}
            label="Twilio Auth Token"
            type="password"
            value={value('twilioAuthToken')}
            placeholder={isConfigured(config.twilioAuthToken) ? '•••••••• (already set)' : 'sk_xxxxx'}
            hint="Stored encrypted. Leave blank to keep the existing token."
            onChange={(v) => onField('twilioAuthToken', v)}
          />
          <ConfigField
            label="Business Phone Number"
            value={value('businessPhone')}
            placeholder="+1 555 010 0000"
            onChange={(v) => onField('businessPhone', v)}
          />
        </div>
      );
    default:
      return null;
  }

  function ConfigField({
    label,
    type = 'text',
    placeholder,
    hint,
    icon: Icon,
    value: fieldValue,
    onChange,
  }: {
    label: string;
    type?: string;
    placeholder?: string;
    hint?: string;
    icon?: typeof Link2;
    value?: string;
    onChange?: (value: string) => void;
  }) {
    return (
      <div>
        <label className={`block text-sm font-medium text-zinc-300 mb-2 font-agrandir`}>{label}</label>
        <div className="flex items-center gap-2">
          {Icon && (
            <span className="text-zinc-500 shrink-0">
              <Icon className="h-4 w-4" />
            </span>
          )}
          <input
            type={type}
            value={fieldValue ?? ''}
            placeholder={placeholder}
            onChange={(e) => onChange?.(e.target.value)}
            className={`w-full px-3 py-2 rounded-lg bg-slate-900 text-white border border-white/10 ${theme.inputFocus} outline-none transition-colors text-sm`}
          />
        </div>
        {hint && <p className="text-xs text-zinc-500 mt-1">{hint}</p>}
      </div>
    );
  }

  function ConfigSelect({
    label,
    options,
    value,
    onChange,
  }: {
    label: string;
    options: string[];
    value?: string;
    onChange?: (value: string) => void;
  }) {
    return (
      <div>
        <label className={`block text-sm font-medium text-zinc-300 mb-2 font-agrandir`}>{label}</label>
        <select
          value={value ?? ''}
          onChange={(e) => onChange?.(e.target.value)}
          className={`w-full px-3 py-2 rounded-lg bg-slate-900 text-white border border-white/10 ${theme.inputFocus} outline-none transition-colors text-sm`}
        >
          <option value="">Select…</option>
          {options.map((opt) => (
            <option key={opt}>{opt}</option>
          ))}
        </select>
      </div>
    );
  }
}
