'use client';

import { useEffect, useState, useRef } from 'react';
import {
  Loader2,
  Plus,
  X,
  Trash2,
  ToggleLeft,
  ToggleRight,
  FileText,
  Tag,
  AlertCircle,
  Check,
} from 'lucide-react';

export interface TenantSummary {
  id: string;
  name: string;
  tenant_id?: string;
  category?: string | null;
}

interface KnowledgeEntry {
  id: string;
  tenant_id: string;
  title: string;
  content: string;
  category: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface KnowledgeFormData {
  title: string;
  content: string;
  category: string;
  is_active: boolean;
}

const BLANK_FORM: KnowledgeFormData = {
  title: '',
  content: '',
  category: '',
  is_active: true,
};

export function ResellerKnowledgeManager({
  tenants,
  selectedTenantId,
  onSelectedTenantIdChange,
}: {
  tenants: TenantSummary[];
  selectedTenantId?: string;
  onSelectedTenantIdChange?: (id: string) => void;
}) {
  const [localTenantId, setLocalTenantId] = useState<string>(tenants[0]?.id ?? '');
  const activeTenantId = selectedTenantId ?? localTenantId;
  const setActiveTenantId = onSelectedTenantIdChange ?? setLocalTenantId;
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<KnowledgeFormData>(BLANK_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const selectedTenant = tenants.find((t) => t.id === activeTenantId) ?? null;

  const hasFetchedRef = useRef(false);

  useEffect(() => {
    if (!activeTenantId) return;

    hasFetchedRef.current = false;

    const loadData = async () => {
      if (hasFetchedRef.current) return;
      hasFetchedRef.current = true;

      try {
        setLoading(true);
        const res = await fetch(`/api/reseller/knowledge?tenantId=${encodeURIComponent(activeTenantId)}`, {
          method: 'GET',
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error ?? `HTTP ${res.status}`);
        }
        const data = await res.json();
        setEntries(data.data ?? []);
      } catch (err) {
        setStatus({
          type: 'error',
          message: err instanceof Error ? err.message : 'Failed to load knowledge base',
        });
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [activeTenantId]);

  const openAddForm = () => {
    setEditingId(null);
    setForm(BLANK_FORM);
    setShowForm(true);
    setStatus(null);
  };

  const openEditForm = (entry: KnowledgeEntry) => {
    setEditingId(entry.id);
    setForm({
      title: entry.title,
      content: entry.content,
      category: entry.category ?? '',
      is_active: entry.is_active,
    });
    setShowForm(true);
    setStatus(null);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(BLANK_FORM);
    setStatus(null);
  };

  const handleSubmit = async () => {
    if (!activeTenantId) return;

    setSaving(true);
    setStatus(null);

    try {
      const payload = {
        tenantId: activeTenantId,
        title: form.title.trim(),
        content: form.content.trim(),
        category: form.category.trim() || null,
        is_active: form.is_active,
      };

      if (!payload.title || !payload.content) {
        throw new Error('Title and content are required');
      }

      const res = await fetch('/api/reseller/knowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }

      const result = await res.json();
      setEntries((prev) => (editingId ? prev.map((e) => (e.id === editingId ? result.data : e)) : [result.data, ...prev]));
      setStatus({ type: 'success', message: editingId ? 'Entry updated successfully' : 'Entry created successfully' });
      setTimeout(closeForm, 800);
    } catch (err) {
      setStatus({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to save entry',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!activeTenantId) return;
    if (!confirm('Are you sure you want to delete this knowledge entry? This action cannot be undone.')) return;

    setDeletingId(id);
    setStatus(null);

    try {
      const res = await fetch('/api/reseller/knowledge', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId: activeTenantId, id }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }

      setEntries((prev) => prev.filter((e) => e.id !== id));
      setStatus({ type: 'success', message: 'Entry deleted successfully' });
      setTimeout(() => setStatus(null), 3000);
    } catch (err) {
      setStatus({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to delete entry',
      });
    } finally {
      setDeletingId(null);
    }
  };

  const handleToggleActive = async (entry: KnowledgeEntry) => {
    if (!activeTenantId) return;

    setTogglingId(entry.id);
    setStatus(null);

    try {
      const res = await fetch('/api/reseller/knowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: activeTenantId,
          title: entry.title,
          content: entry.content,
          category: entry.category,
          is_active: !entry.is_active,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }

      const result = await res.json();
      setEntries((prev) => prev.map((e) => (e.id === entry.id ? result.data : e)));
      setStatus({ type: 'success', message: entry.is_active ? 'Entry deactivated' : 'Entry activated' });
      setTimeout(() => setStatus(null), 3000);
    } catch (err) {
      setStatus({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to update entry',
      });
    } finally {
      setTogglingId(null);
    }
  };

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString('en-ZA', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return iso;
    }
  };

  return (
    <div className="w-full rounded-xl backdrop-blur-md bg-slate-900/60 border border-white/10 p-5 sm:p-6 space-y-6">
      {/* Header + Tenant Selector */}
      <div className="pb-5 border-b border-white/5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-[10px] tracking-[0.2em] uppercase text-white font-medium mb-2 block">
              Select Client
            </label>
            <select
              value={activeTenantId}
              onChange={(e) => setActiveTenantId(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg bg-white/10 border border-white/20 text-white text-sm tracking-wide outline-none focus:border-[#0097b2] focus:ring-1 focus:ring-[#0097b2]/50 transition-all appearance-none cursor-pointer"
            >
              <option value="" className="bg-slate-900 text-white">
                -- Select a client --
              </option>
              {tenants.map((t) => (
                <option key={t.id} value={t.id} className="bg-slate-900 text-white">
                  {t.name} {t.category ? `(${t.category})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end">
            {selectedTenant && (
              <div className="w-full">
                <label className="text-[10px] tracking-[0.2em] uppercase text-white font-medium mb-2 block">
                  Selected Client
                </label>
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-white/5 border border-white/10">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 border border-white/10">
                    <FileText className="h-4 w-4 text-white" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white truncate">{selectedTenant.name}</p>
                    <p className="text-[10px] text-slate-300 font-medium uppercase tracking-wider">
                      {selectedTenant.category || 'General'}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Knowledge Manager */}
      {activeTenantId ? (
        <div className="space-y-4">
          {/* Section Header */}
          <div className="mb-6">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-white" />
                <h2 className="text-sm font-medium text-white font-agrandir">Knowledge Base</h2>
              </div>
              <button
                onClick={openAddForm}
                className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 hover:bg-white/20 border border-white/10 hover:border-white/25 text-white text-xs font-medium py-2 px-3 transition-colors min-h-[36px]"
              >
                <Plus className="h-3.5 w-3.5 text-white" />
                Add Entry
              </button>
            </div>
            <p className="text-xs text-slate-200 font-medium mt-1">
              Manage FAQ articles, policies, and training content for {selectedTenant?.name}.
            </p>
          </div>

          {/* Status Messages */}
          {status && (
            <div
              className={`p-3 rounded-lg flex items-center gap-2 text-xs ${
                status.type === 'success'
                  ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300'
                  : 'bg-red-500/15 border border-red-500/30 text-red-300'
              }`}
              role="alert"
            >
              {status.type === 'error' && <AlertCircle className="h-4 w-4 shrink-0" />}
              {status.type === 'success' && <Check className="h-4 w-4 shrink-0" />}
              {status.message}
            </div>
          )}

          {/* Loading State */}
          {loading ? (
            <div className="flex items-center justify-center py-12 text-slate-200 text-sm gap-2">
              <Loader2 className="h-5 w-5 animate-spin" /> Loading knowledge base…
            </div>
          ) : entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-200 text-sm gap-3 border border-dashed border-white/10 rounded-xl">
              <FileText className="h-8 w-8 text-white" />
              <p className="text-slate-200">No knowledge entries yet for this client.</p>
              <button
                onClick={openAddForm}
                className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 hover:bg-white/20 border border-white/10 text-white text-xs font-medium py-2 px-3 transition-colors"
              >
                <Plus className="h-3.5 w-3.5 text-white" />
                Create the first entry
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {entries.map((entry) => (
                <div
                  key={entry.id}
                  className={`group relative flex flex-col rounded-2xl border bg-slate-950/30 p-5 transition-all duration-200 hover:border-white/30 hover:shadow-lg hover:shadow-black/30 ${
                    entry.is_active ? 'border-white/10' : 'border-white/5 opacity-75'
                  }`}
                >
                  {/* Status & Category */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase ${
                          entry.is_active
                            ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                            : 'bg-zinc-500/15 text-zinc-400 border border-zinc-500/30'
                        }`}
                      >
                        {entry.is_active ? 'Active' : 'Inactive'}
                      </span>
                      {entry.category && (
                        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase bg-violet-500/10 text-violet-300 border border-violet-500/20">
                          <Tag className="h-3 w-3" />
                          {entry.category}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleToggleActive(entry)}
                        disabled={togglingId === entry.id}
                        title={entry.is_active ? 'Deactivate' : 'Activate'}
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-50"
                      >
                        {togglingId === entry.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : entry.is_active ? (
                          <ToggleRight className="h-4 w-4 text-emerald-400" />
                        ) : (
                          <ToggleLeft className="h-4 w-4 text-zinc-500" />
                        )}
                      </button>
                      <button
                        onClick={() => openEditForm(entry)}
                        title="Edit entry"
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"
                      >
                        <FileText className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(entry.id)}
                        disabled={deletingId === entry.id}
                        title="Delete entry"
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                      >
                        {deletingId === entry.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Title & Content */}
                  <h3 className="text-sm font-semibold text-white font-agrandir mb-2 leading-snug">{entry.title}</h3>
                  <p className="text-xs text-slate-200 leading-relaxed line-clamp-3 flex-1">
                    {entry.content}
                  </p>

                  {/* Timestamp */}
                  <div className="mt-4 pt-3 border-t border-white/5">
                    <p className="text-[10px] text-slate-300">
                      Updated {formatDate(entry.updated_at)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-12 text-slate-200 text-sm gap-3 border border-dashed border-white/10 rounded-xl">
          <FileText className="h-8 w-8 text-white" />
          <p>Select a client to manage their knowledge base.</p>
        </div>
      )}

      {/* Add / Edit Modal */}
      {showForm && activeTenantId && (
        <div
          className="fixed inset-0 z-[10003] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label={editingId ? 'Edit knowledge entry' : 'Add knowledge entry'}
        >
          <button
            type="button"
            aria-label="Close"
            onClick={closeForm}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          <div className="relative w-full max-w-lg bg-slate-950 border border-white/10 rounded-2xl shadow-2xl p-5 sm:p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3 mb-5">
              <div>
                <h3 className="text-sm font-semibold text-white font-agrandir">
                  {editingId ? 'Edit Knowledge Entry' : 'New Knowledge Entry'}
                </h3>
                <p className="text-[10px] uppercase tracking-wider text-slate-300 font-medium mt-0.5">
                  {editingId ? 'Update title, content, or status' : 'Add a new article to the knowledge base'}
                </p>
              </div>
              <button
                type="button"
                onClick={closeForm}
                aria-label="Close"
                className="flex items-center justify-center w-8 h-8 rounded-lg text-zinc-400 hover:bg-white/5 hover:text-white transition-colors shrink-0"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-white mb-2 font-agrandir">
                  Title <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                  placeholder="e.g., How to reset your password"
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 text-white border border-white/10 focus:border-cyan-500 outline-none transition-colors text-sm"
                  maxLength={500}
                />
              </div>

              {/* Category */}
              <div>
                <label className="block text-sm font-medium text-white mb-2 font-agrandir">
                  Category
                </label>
                <input
                  type="text"
                  value={form.category}
                  onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))}
                  placeholder="e.g., faq, policies, products"
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 text-white border border-white/10 focus:border-cyan-500 outline-none transition-colors text-sm"
                  maxLength={200}
                />
              </div>

              {/* Content */}
              <div>
                <label className="block text-sm font-medium text-white mb-2 font-agrandir">
                  Content <span className="text-red-400">*</span>
                </label>
                <textarea
                  value={form.content}
                  onChange={(e) => setForm((prev) => ({ ...prev, content: e.target.value }))}
                  placeholder="Write the full knowledge article content here..."
                  rows={8}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 text-white border border-white/10 focus:border-cyan-500 outline-none transition-colors text-sm resize-none"
                />
              </div>

              {/* Active Toggle */}
              <div className="flex items-center justify-between p-3 bg-white/5 border border-white/10 rounded-lg">
                <div>
                  <p className="text-sm font-medium text-white">Active</p>
                  <p className="text-xs text-slate-200">
                    {form.is_active ? 'This entry is visible to the AI' : 'This entry is hidden from the AI'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, is_active: !prev.is_active }))}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    form.is_active ? 'bg-[#0097b2]' : 'bg-white/30'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      form.is_active ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {/* Validation Message */}
              {status && showForm && (
                <div
                  className={`p-3 rounded-lg flex items-center gap-2 text-xs ${
                    status.type === 'success'
                      ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300'
                      : 'bg-red-500/15 border border-red-500/30 text-red-300'
                  }`}
                  role="alert"
                >
                  {status.type === 'error' && <AlertCircle className="h-4 w-4 shrink-0" />}
                  {status.type === 'success' && <Check className="h-4 w-4 shrink-0" />}
                  {status.message}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="mt-6 flex flex-col-reverse sm:flex-row gap-2">
              <button
                onClick={closeForm}
                className="flex-1 py-2.5 rounded-lg border border-white/10 text-white hover:bg-white/5 text-sm font-medium transition-colors min-h-[40px]"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={saving || !form.title.trim() || !form.content.trim()}
                aria-busy={saving}
                className="flex-1 py-2.5 rounded-lg bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white font-semibold text-sm transition-all duration-200 shadow-lg shadow-cyan-500/10 min-h-[40px] disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Saving…
                  </>
                ) : editingId ? (
                  'Update Entry'
                ) : (
                  'Create Entry'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
