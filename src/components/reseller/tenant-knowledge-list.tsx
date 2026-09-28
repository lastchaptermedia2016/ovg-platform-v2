'use client';

import {
  AlertCircle,
  Edit,
  FileText,
  Loader2,
  RotateCw,
  Search,
  Tag,
  ToggleLeft,
  ToggleRight,
  Trash2,
} from 'lucide-react';
import type { KnowledgeEmptyReason } from '@/components/reseller/useTenantKnowledgeList';
import type { KnowledgeItem } from '@/lib/reseller/tenant-knowledge-engine';
import {
  KNOWLEDGE_CATEGORY_LABELS,
  knowledgeCategoryLabel,
  type KnowledgeFilter,
} from '@/lib/reseller/tenant-knowledge-ui';

/**
 * Phase 4.4 — Tenant knowledge list.
 *
 * Renders the loading / error / empty / no-match states, the entries table and
 * the footer summary. Fully controlled: mutations are reported upwards through
 * callbacks so the controller hook remains the single source of truth.
 */

function formatTimestamp(item: KnowledgeItem): string | null {
  const raw = item.updated_at ?? item.created_at;
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toLocaleDateString();
}

function CategoryBadge({ category }: { category: string | null }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-slate-700/80 bg-slate-900/90 px-3 py-1 text-xs font-medium text-slate-200">
      <Tag className="h-3 w-3 shrink-0 text-[#0097b2]" />
      {knowledgeCategoryLabel(category)}
    </span>
  );
}

interface TenantKnowledgeListProps {
  items: KnowledgeItem[];
  visibleItems: KnowledgeItem[];
  activeCount: number;
  emptyReason: KnowledgeEmptyReason;
  loading: boolean;
  loadError: string | null;
  query: string;
  filter: KnowledgeFilter;
  toggleBusyId: string | null;
  tenantLabel?: string;
  onRetry: () => void;
  onAdd: () => void;
  onEdit: (item: KnowledgeItem) => void;
  onToggle: (item: KnowledgeItem) => void;
  onDelete: (item: KnowledgeItem) => void;
}

export function TenantKnowledgeList({
  items,
  visibleItems,
  activeCount,
  emptyReason,
  loading,
  loadError,
  query,
  filter,
  toggleBusyId,
  tenantLabel,
  onRetry,
  onAdd,
  onEdit,
  onToggle,
  onDelete,
}: TenantKnowledgeListProps) {
  return (
    <>
      {/* Entries */}
      <div className="overflow-hidden rounded-xl border border-white/10 bg-slate-950/90 backdrop-blur-xl shadow-2xl p-6">
        {loading && items.length === 0 ? (
          <div className="flex items-center justify-center p-16">
            <Loader2
              className="h-8 w-8 animate-spin text-[#0097b2]"
              aria-label="Loading knowledge entries"
            />
          </div>
        ) : loadError ? (
          <div className="flex flex-col items-center gap-3 p-12 text-center">
            <AlertCircle className="h-8 w-8 text-red-400" />
            <div>
              <p className="text-base font-semibold text-white">
                Could not load the knowledge base
              </p>
              <p className="mt-1 text-sm text-white/60">{loadError}</p>
            </div>
            <button
              type="button"
              onClick={onRetry}
              className="mt-1 inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-white/10 px-4 text-sm font-medium text-white transition-colors hover:bg-white/20"
            >
              <RotateCw className="h-4 w-4" />
              Try again
            </button>
          </div>
        ) : emptyReason === 'empty' ? (
          <div className="flex flex-col items-center gap-4 p-12 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/5">
              <FileText className="h-7 w-7 text-white/40" />
            </div>
            <div>
              <p className="text-base font-semibold text-white">No knowledge entries yet</p>
              <p className="mt-1 text-sm text-white/60">
                {tenantLabel
                  ? `Nothing has been added for ${tenantLabel} yet.`
                  : 'Add your first article to train the AI.'}
              </p>
            </div>
            <button
              type="button"
              onClick={onAdd}
              className="mt-1 min-h-[40px] rounded-lg bg-white/10 px-4 text-sm font-medium text-white transition-colors hover:bg-white/20"
            >
              Add your first entry
            </button>
          </div>
        ) : emptyReason === 'no-results' ? (
          <div className="flex flex-col items-center gap-3 p-12 text-center">
            <Search className="h-8 w-8 text-white/30" />
            <p className="text-base font-semibold text-white">No matching entries</p>
            <p className="text-sm text-white/60">
              Try a different search term or clear the filters.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-white/60">
                    Title
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-white/60">
                    Category
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-white/60">
                    Status
                  </th>
                  <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-white/60">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {visibleItems.map((item) => {
                  const timestamp = formatTimestamp(item);
                  return (
                    <tr
                      key={item.id}
                      className="group transition-all bg-slate-900/70 hover:bg-slate-800/80 border border-white/5"
                    >
                      <td className="px-5 py-4">
                        <div className="flex items-start gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/5">
                            <FileText className="h-4 w-4 text-[#0097b2]" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-100">{item.title}</p>
                            <p className="mt-0.5 line-clamp-1 text-xs text-slate-400">
                              {item.content}
                            </p>
                            {timestamp && (
                              <p className="mt-0.5 text-[11px] text-slate-500">
                                Updated {timestamp}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <CategoryBadge category={item.category} />
                      </td>
                      <td className="px-5 py-4">
                        <button
                          type="button"
                          onClick={() => onToggle(item)}
                          disabled={toggleBusyId !== null}
                          aria-pressed={item.is_active}
                          aria-label={item.is_active ? 'Deactivate entry' : 'Activate entry'}
                          className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                            item.is_active
                              ? 'bg-emerald-950/90 text-emerald-300 border border-emerald-500/50 hover:bg-emerald-950'
                              : 'bg-slate-900/90 text-slate-400 border border-slate-700/80 hover:bg-slate-800 hover:text-slate-200'
                          } disabled:opacity-60`}
                        >
                          {toggleBusyId === item.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : item.is_active ? (
                            <ToggleRight className="h-3.5 w-3.5" />
                          ) : (
                            <ToggleLeft className="h-3.5 w-3.5" />
                          )}
                          {item.is_active ? 'Active' : 'Inactive'}
                        </button>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => onEdit(item)}
                            aria-label={`Edit ${item.title}`}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white/5 hover:text-white"
                          >
                            <Edit className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDelete(item)}
                            aria-label={`Delete ${item.title}`}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-red-500/10 hover:text-red-400"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Footer summary */}
      {!loading && !loadError && items.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-white/50">
          <span>
            Showing {visibleItems.length} of {items.length} entries
            {query ? ` for “${query}”` : ''}
            {filter !== 'all' ? ` · ${KNOWLEDGE_CATEGORY_LABELS[filter]}` : ''}
          </span>
          <span>
            Active: {activeCount} · Inactive: {items.length - activeCount}
          </span>
        </div>
      )}
    </>
  );
}
