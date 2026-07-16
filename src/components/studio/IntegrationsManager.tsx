'use client';

import { useEffect, useState } from 'react';
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

const STATUS_META: Record<IntegrationStatus, { label: string; className: string }> = {
  active: { label: 'Active', className: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30' },
  configure: { label: 'Configure', className: 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30' },
  premium: { label: 'Premium Add-on', className: 'bg-amber-500/15 text-amber-300 border border-amber-500/30' },
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

  const apiBase =
    role === 'reseller' ? '/api/reseller/manage-client-integrations' : '/api/client/integrations';

  const active = INTEGRATIONS.find((i) => i.id === activeId) ?? null;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const url =
          role === 'reseller' && targetClientId
            ? `${apiBase}?targetClientId=${encodeURIComponent(targetClientId)}`
            : apiBase;
        const res = await fetch(url, { method: 'GET' });
        if (!res.ok) return;
        const data = await res.json();
        const incoming = (data.integrations ?? {}) as Record<string, IntegrationConfigState>;
        if (!cancelled) {
          setConfigs((prev) => {
            const merged: Record<string, IntegrationConfigState> = { ...prev };
            for (const item of INTEGRATIONS) {
              merged[item.id] = { ...BLANK_CONFIG, ...(incoming[item.id] ?? {}) };
            }
            return merged;
          });
        }
      } catch {
        // Non-fatal: fall back to blank forms.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiBase, role, targetClientId]);

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
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
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
                className={`group relative flex flex-col rounded-2xl border bg-gradient-to-br ${item.accent} p-5 transition-all duration-200 hover:border-white/30 hover:shadow-lg hover:shadow-black/30`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/5 border border-white/10 backdrop-blur">
                    <Icon className="h-5 w-5" />
                  </div>
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase ${statusMeta.className}`}
                  >
                    {statusMeta.label}
                  </span>
                </div>

                <h3 className="mt-4 text-sm font-semibold text-white font-agrandir">
                  {item.name}
                </h3>
                <p className="text-[10px] uppercase tracking-wider text-white/40 mt-0.5">
                  {item.tagline}
                </p>
                <p className="mt-2 text-xs text-zinc-300/80 leading-relaxed flex-1">
                  {item.description}
                </p>

                {INTEGRATION_PRICING[item.id] && (
                  (() => {
                    const p = INTEGRATION_PRICING[item.id];
                    return (
                      <div className="my-3 flex flex-wrap items-center justify-between gap-1.5 rounded-xl border border-white/5 bg-white/5 p-2.5 text-xs text-slate-300">
                        <span className="font-medium">
                          Once-off: <span className="text-white">${p.setupUsd}</span> /{' '}
                          <span className="text-white">R{p.setupZar.toLocaleString('en-ZA')}</span>
                        </span>
                        <span className="font-medium">
                          Monthly: <span className="text-white">${p.monthlyUsd}</span> /{' '}
                          <span className="text-white">R{p.monthlyZar.toLocaleString('en-ZA')}</span>
                        </span>
                      </div>
                    );
                  })()
                )}


                {configured && (
                  <p className="mt-3 inline-flex items-center gap-1 text-[10px] text-emerald-300">
                    <Check className="h-3 w-3" /> Connected
                  </p>
                )}

                <button
                  onClick={() => setActiveId(item.id)}
                  className="mt-4 w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-white/10 hover:bg-white/20 border border-white/10 hover:border-white/25 text-white text-xs font-medium py-2.5 transition-colors min-h-[40px]"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  {item.cta}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Slide-over configuration drawer */}
      {active && (
        <div
          className="fixed inset-0 z-[10003] flex justify-end"
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
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          <div className="relative w-full max-w-md h-full overflow-y-auto bg-slate-950 border-l border-white/10 shadow-2xl p-5 sm:p-6">
            <div className="flex items-start justify-between gap-3 mb-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/5 border border-white/10">
                  <active.icon className="h-5 w-5 text-cyan-300" />
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

            <p className="text-xs text-zinc-400 mb-5">{active.description}</p>

            <IntegrationConfigForm
              integration={active}
              config={configs[active.id] ?? BLANK_CONFIG}
              onField={(key, value) => updateField(active.id, key, value)}
            />

            {status && (
              <div
                className={`mt-4 p-3 rounded-lg flex items-center gap-2 text-xs ${
                  status.type === 'success'
                    ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300'
                    : 'bg-red-500/15 border border-red-500/30 text-red-300'
                }`}
                role="alert"
              >
                {status.type === 'error' && <AlertCircle className="h-4 w-4 shrink-0" />}
                {status.message}
              </div>
            )}

            <div className="mt-6 flex flex-col-reverse sm:flex-row gap-2">
              <button
                onClick={() => {
                  setActiveId(null);
                  setStatus(null);
                }}
                className="flex-1 py-2.5 rounded-lg border border-white/10 text-zinc-300 hover:bg-white/5 text-sm font-medium transition-colors min-h-[40px]"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={savingId === active.id}
                aria-busy={savingId === active.id}
                className="flex-1 py-2.5 rounded-lg bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white font-semibold text-sm transition-all duration-200 shadow-lg shadow-cyan-500/10 min-h-[40px] disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
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
      )}
    </div>
  );
}

function IntegrationConfigForm({
  integration,
  config,
  onField,
}: {
  integration: Integration;
  config: IntegrationConfigState;
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
        <div className="space-y-4">
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
        <div className="space-y-4">
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
        <div className="space-y-4">
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
              dragOver ? 'border-cyan-400/60 bg-cyan-500/10' : 'border-white/15 bg-slate-900/40'
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
                  <Check className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                  <span className="truncate">{f}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      );
    case 'live-inventory':
      return (
        <div className="space-y-4">
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
        <div className="space-y-4">
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
        <label className="block text-sm font-medium text-zinc-300 mb-2 font-agrandir">{label}</label>
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
            className="w-full px-3 py-2 rounded-lg bg-slate-900 text-white border border-white/10 focus:border-cyan-500 outline-none transition-colors text-sm"
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
        <label className="block text-sm font-medium text-zinc-300 mb-2 font-agrandir">{label}</label>
        <select
          value={value ?? ''}
          onChange={(e) => onChange?.(e.target.value)}
          className="w-full px-3 py-2 rounded-lg bg-slate-900 text-white border border-white/10 focus:border-cyan-500 outline-none transition-colors text-sm"
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
