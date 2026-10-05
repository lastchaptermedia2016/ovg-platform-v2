'use client';

import { AlertCircle, Check, Plus, RotateCw, Search, X } from 'lucide-react';
import type { KnowledgeNotice } from '@/components/reseller/useTenantKnowledgeList';
import {
  KNOWLEDGE_CATEGORY_LABELS,
  KNOWLEDGE_FIELD_CLASS,
  KNOWLEDGE_FILTER_OPTIONS,
  isKnowledgeFilter,
  type KnowledgeFilter,
} from '@/lib/reseller/tenant-knowledge-ui';

/**
 * Phase 4.4 — Tenant knowledge toolbar.
 *
 * Search box, category filter, refresh / add actions and the transient action
 * feedback banner. Fully controlled: every value and callback is injected by
 * the controller hook, so this file stays presentational.
 */

interface TenantKnowledgeToolbarProps {
  query: string;
  onQueryChange: (value: string) => void;
  filter: KnowledgeFilter;
  onFilterChange: (value: KnowledgeFilter) => void;
  loading: boolean;
  onRefresh: () => void;
  onAdd: () => void;
  notice: KnowledgeNotice;
  onDismissNotice: () => void;
}

export function TenantKnowledgeToolbar({
  query,
  onQueryChange,
  filter,
  onFilterChange,
  loading,
  onRefresh,
  onAdd,
  notice,
  onDismissNotice,
}: TenantKnowledgeToolbarProps) {
  return (
    <>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] max-w-xs flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
          <input
            type="text"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search knowledge base…"
            aria-label="Search knowledge entries"
            className={`${KNOWLEDGE_FIELD_CLASS} pl-9 pr-9`}
          />
          {query !== '' && (
            <button
              type="button"
              onClick={() => onQueryChange('')}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-white/50 transition-colors hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <select
          value={filter}
          onChange={(event) => {
            const next = event.target.value;
            if (isKnowledgeFilter(next)) onFilterChange(next);
          }}
          aria-label="Filter by category"
          className="cursor-pointer rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-cyan-500"
        >
          {KNOWLEDGE_FILTER_OPTIONS.map((value) => (
            <option key={value} value={value} className="bg-slate-900">
              {value === 'all' ? 'All categories' : KNOWLEDGE_CATEGORY_LABELS[value]}
            </option>
          ))}
        </select>

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            aria-label="Refresh entries"
            className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-white/10 px-3 text-sm font-medium text-white/70 transition-colors hover:bg-white/5 hover:text-white disabled:opacity-50"
          >
            <RotateCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
          <button
            type="button"
            onClick={onAdd}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 px-5 text-sm font-semibold text-white shadow-lg shadow-cyan-500/15 transition-all hover:from-blue-500 hover:to-cyan-400"
          >
            <Plus className="h-4 w-4" />
            Add Entry
          </button>
        </div>
      </div>

      {/* Action feedback */}
      {notice && (
        <div
          role={notice.type === 'error' ? 'alert' : 'status'}
          className={`flex items-center gap-2 rounded-lg border p-3 text-xs ${
            notice.type === 'success'
              ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300'
              : 'border-red-500/30 bg-red-500/15 text-red-300'
          }`}
        >
          {notice.type === 'error' ? (
            <AlertCircle className="h-4 w-4 shrink-0" />
          ) : (
            <Check className="h-4 w-4 shrink-0" />
          )}
          <span>{notice.message}</span>
          <button
            type="button"
            onClick={onDismissNotice}
            aria-label="Dismiss message"
            className="ml-auto rounded p-1 opacity-70 transition-opacity hover:opacity-100 min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </>
  );
}
