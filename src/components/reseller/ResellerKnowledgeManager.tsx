'use client';

import { useCallback, useMemo, useState, type ChangeEvent } from 'react';
import { Building2, Search, Plus, RotateCw } from 'lucide-react';
import { TenantKnowledgeTable } from '@/components/reseller/tenant-knowledge-table';

/**
 * Reseller surface — tenant knowledge orchestrator.
 *
 * Owns client-workspace selection only; every CRUD concern (dialog, delete
 * confirmation, optimistic toggle, search/filter) lives in
 * `TenantKnowledgeTable`. Selection is controlled when
 * `onSelectedTenantIdChange` is supplied (page-level deep links) and
 * uncontrolled otherwise.
 */

export interface TenantSummary {
  id: string;
  name: string;
  tenant_id?: string;
  category?: string | null;
}

interface ResellerKnowledgeManagerProps {
  tenants: TenantSummary[];
  selectedTenantId?: string;
  onSelectedTenantIdChange?: (tenantId: string) => void;
}

export function ResellerKnowledgeManager({
  tenants,
  selectedTenantId,
  onSelectedTenantIdChange,
}: ResellerKnowledgeManagerProps) {
  const [internalTenantId, setInternalTenantId] = useState<string>(
    () => tenants[0]?.id ?? '',
  );
  const activeTenantId = selectedTenantId ?? internalTenantId;
  const activeTenant = useMemo(
    () => tenants.find((tenant) => tenant.id === activeTenantId) ?? null,
    [tenants, activeTenantId],
  );

  const handleTenantChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      const next = event.target.value;
      if (onSelectedTenantIdChange) onSelectedTenantIdChange(next);
      else setInternalTenantId(next);
    },
    [onSelectedTenantIdChange],
  );

  if (tenants.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-12 text-center">
        <Building2 className="h-8 w-8 text-white/30" />
        <p className="text-base font-semibold text-white">No client workspaces yet</p>
        <p className="text-sm text-white/60">
          Create a client first — knowledge entries are scoped per client workspace.
        </p>
      </div>
    );
  }

  const activeClientName = activeTenant?.name ?? 'Select a workspace';

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <div className="mb-6 rounded-xl border border-white/10 bg-slate-950/90 p-6 backdrop-blur-xl shadow-2xl">
        {/* Top Row: Workspace Title & Subtitle */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-white/10">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-cyan-400 bg-cyan-950/80 px-2.5 py-0.5 rounded-full border border-cyan-500/30">
                CLIENT WORKSPACE
              </span>
            </div>
            <h1 className="text-2xl font-bold text-white mt-2">Knowledge Base Settings</h1>
            <p className="text-sm text-slate-300 mt-1">
              Managing the knowledge base for <strong className="text-cyan-300">{activeClientName}</strong>
            </p>
          </div>

          {/* Client Dropdown Select */}
          <div className="bg-slate-900/90 border border-slate-700/60 rounded-lg px-3 py-1.5">
            <select
              value={activeTenantId}
              onChange={handleTenantChange}
              className="cursor-pointer bg-transparent border-none outline-none text-sm text-white"
              aria-label="Select client workspace"
            >
              {tenants.map((tenant) => (
                <option key={tenant.id} value={tenant.id} className="bg-slate-900">
                  {tenant.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Bottom Row: Search & Action Bar */}
        <div className="pt-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-3 w-full sm:w-auto flex-1">
            {/* Search Input */}
            <div className="relative min-w-[200px] max-w-xs flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
              <input
                type="text"
                placeholder="Search knowledge base…"
                aria-label="Search knowledge entries"
                className="w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 pl-9 pr-9 text-sm text-white outline-none transition-colors focus:border-cyan-500 placeholder:text-white/40"
              />
            </div>

            {/* Category Dropdown */}
            <select
              aria-label="Filter by category"
              className="cursor-pointer rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-cyan-500"
            >
              <option value="all" className="bg-slate-900">All categories</option>
              <option value="general" className="bg-slate-900">General</option>
              <option value="policy" className="bg-slate-900">Policy</option>
              <option value="faq" className="bg-slate-900">FAQ</option>
              <option value="technical" className="bg-slate-900">Technical</option>
              <option value="branding" className="bg-slate-900">Branding</option>
            </select>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            {/* Refresh Button */}
            <button
              type="button"
              aria-label="Refresh entries"
              className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-white/10 px-3 text-sm font-medium text-white/70 transition-colors hover:bg-white/5 hover:text-white"
            >
              <RotateCw className="h-4 w-4" />
              <span className="hidden sm:inline">Refresh</span>
            </button>
            {/* + Add Entry Button */}
            <button
              type="button"
              className="inline-flex min-h-[40px] items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 px-5 text-sm font-semibold text-white shadow-lg shadow-cyan-500/15 transition-all hover:from-blue-500 hover:to-cyan-400"
            >
              <Plus className="h-4 w-4" />
              Add Entry
            </button>
          </div>
        </div>
      </div>

      {activeTenantId ? (
        <TenantKnowledgeTable
          key={activeTenantId}
          tenantId={activeTenantId}
          tenantLabel={activeTenant?.name}
          hideToolbar={true}
        />
      ) : null}
    </div>
  );
}
