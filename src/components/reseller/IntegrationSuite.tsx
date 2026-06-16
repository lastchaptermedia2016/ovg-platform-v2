'use client';

import { useCallback, useState } from 'react';
import type { BookingProviderType } from '@/interfaces/booking-provider.interface';

interface IntegrationSuiteProps {
  tenantId: string;
  tenant?: { metadata?: unknown } | null;
  initialEnabled?: boolean;
  initialProviderType?: BookingProviderType;
  onSaved?: () => void;
}

interface BookingMetadata {
  enabled?: boolean;
  providerType?: BookingProviderType;
  updatedAt?: string;
}

const PROVIDER_OPTIONS: Array<{ value: BookingProviderType; label: string }> = [
  { value: 'INTERNAL', label: 'Built-in Calendar Matrix' },
  { value: 'EXTERNAL', label: 'External Enterprise Adapter Sync' },
];

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function isBookingProviderType(value: unknown): value is BookingProviderType {
  return value === 'INTERNAL' || value === 'EXTERNAL';
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
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

function readBookingMetadata(value: unknown): BookingMetadata {
  const root = asRecord(value);
  if (!root) return {};

  const metadata = asRecord(root.metadata) ?? root;
  const directProviderType = metadata.booking_provider_type;
  const directEnabled = metadata.enabled_addons;

  if (isBookingProviderType(directProviderType) && typeof directEnabled === 'boolean') {
    return {
      enabled: directEnabled,
      providerType: directProviderType,
      updatedAt: readString(metadata.booking_updated_at) ?? readString(metadata.updatedAt),
    };
  }

  const booking =
    readNestedRecord(metadata, ['integrations', 'booking']) ??
    readNestedRecord(metadata, ['booking']);

  if (!booking) {
    return {};
  }

  const providerType = booking.providerType;
  const enabled = booking.enabled;
  const updatedAt = booking.updatedAt;

  return {
    enabled: typeof enabled === 'boolean' ? enabled : undefined,
    providerType: isBookingProviderType(providerType) ? providerType : undefined,
    updatedAt: readString(updatedAt),
  };
}

export function IntegrationSuite({
  tenantId,
  tenant,
  initialEnabled = false,
  initialProviderType = 'INTERNAL',
  onSaved,
}: IntegrationSuiteProps) {
  const metadata = readBookingMetadata(tenant);
  const [enabled, setEnabled] = useState(metadata.enabled ?? initialEnabled);
  const [providerType, setProviderType] = useState<BookingProviderType>(
    metadata.providerType ?? initialProviderType,
  );
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  const handleToggleEnabled = useCallback(() => {
    setEnabled((current) => !current);
  }, []);

  const handleProviderTypeChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      setProviderType(event.target.value as BookingProviderType);
    },
    [],
  );

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    setSaveMessage(null);

    try {
      const response = await fetch('/api/tenants/update-integration-suite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          enabledAddons: enabled,
          bookingProviderType: providerType,
          enabled,
          providerType,
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? 'Failed to save integration settings');
      }

      const bookingMetadata = readBookingMetadata({ metadata: payload.metadata });
      setUpdatedAt(bookingMetadata.updatedAt ?? new Date().toISOString());
      setSaveMessage('Integration settings saved');
      onSaved?.();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setSaveMessage(`Save failed: ${message}`);
    } finally {
      setIsSaving(false);
    }
  }, [enabled, onSaved, providerType, tenantId]);

  const healthStatus = enabled ? 'CONNECTED' : 'DISCONNECTED';
  const healthColor = enabled ? 'text-emerald-300' : 'text-rose-300';
  const healthDot = enabled ? 'bg-emerald-400' : 'bg-rose-400';

  return (
    <section className="w-full max-w-4xl mx-auto mt-8">
      <div className="bg-slate-900/80 backdrop-blur-md border border-white/10 rounded-2xl p-5 shadow-[0_0_40px_rgba(0,151,178,0.16)]">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <span className="h-2.5 w-2.5 rounded-full bg-[#00E5FF] shadow-[0_0_14px_#00E5FF]" />
              <h2 className="text-sm font-semibold tracking-[0.22em] uppercase text-white">
                Live Booking Engine Sync
              </h2>
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-300">
              Route Hannah’s scheduling flow through the selected booking provider
              adapter and persist the tenant metadata map on save.
            </p>
          </div>

          <span
            className={`inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1 text-[10px] font-bold tracking-[0.18em] uppercase ${healthColor} bg-white/[0.04]`}
          >
            <span className={`h-2 w-2 rounded-full ${healthDot} shadow-[0_0_12px_currentColor]`} />
            {healthStatus}
          </span>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
          <label className="grid gap-2">
            <span className="text-[10px] uppercase tracking-[0.18em] text-slate-400">
              Engine Adapter
            </span>
            <select
              value={providerType}
              onChange={handleProviderTypeChange}
              className="w-full rounded-lg border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 outline-none focus:border-[#00E5FF]"
            >
              {PROVIDER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center justify-between gap-4 rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3">
            <span className="text-[10px] uppercase tracking-[0.18em] text-slate-400">
              Calendar Sync
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              onClick={handleToggleEnabled}
              className={`relative h-7 w-12 rounded-full transition-colors ${
                enabled ? 'bg-emerald-500/70' : 'bg-slate-700'
              }`}
            >
              <span
                className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                  enabled ? 'left-6' : 'left-1'
                }`}
              />
            </button>
          </label>
        </div>

        <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="text-xs text-slate-400">
            {updatedAt ? `Last metadata commit: ${updatedAt}` : 'No metadata commit recorded'}
          </div>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="rounded-lg bg-[#0097b2] px-5 py-2 text-xs font-bold uppercase tracking-[0.16em] text-white transition hover:bg-[#00c4e6] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving ? 'Saving...' : 'Save Integration'}
          </button>
        </div>

        {saveMessage && (
          <div
            className={`mt-3 text-xs ${
              saveMessage.startsWith('Save failed')
                ? 'text-rose-300'
                : 'text-emerald-300'
            }`}
          >
            {saveMessage}
          </div>
        )}
      </div>
    </section>
  );
}
