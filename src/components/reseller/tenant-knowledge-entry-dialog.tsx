'use client';

import { useEffect, useRef } from 'react';
import { Loader2, X } from 'lucide-react';
import {
  KNOWLEDGE_CATEGORIES,
  KNOWLEDGE_FIELD_CLASS,
  type KnowledgeFormDraft,
} from '@/lib/reseller/tenant-knowledge-ui';

/**
 * Phase 4.4 — Add/edit knowledge entry dialog (controlled + presentational).
 *
 * Owns no data state: the parent supplies the draft, its validation errors, and
 * the busy flag. Mounted only while open, so it can focus the title input and
 * bind Escape on mount without an `open` prop.
 */

const CATEGORY_LIST_ID = 'tenant-knowledge-category-options';

interface TenantKnowledgeEntryDialogProps {
  editing: boolean;
  tenantLabel?: string;
  form: KnowledgeFormDraft;
  errors: string[];
  busy: boolean;
  onFormChange: (next: KnowledgeFormDraft) => void;
  onSubmit: () => void;
  onClose: () => void;
}

export function TenantKnowledgeEntryDialog({
  editing,
  tenantLabel,
  form,
  errors,
  busy,
  onFormChange,
  onSubmit,
  onClose,
}: TenantKnowledgeEntryDialogProps) {
  const titleInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    titleInputRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="knowledge-dialog-title"
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/10 bg-slate-950 p-6 shadow-2xl"
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 id="knowledge-dialog-title" className="text-lg font-semibold text-white">
              {editing ? 'Edit knowledge entry' : 'New knowledge entry'}
            </h2>
            <p className="mt-1 text-sm text-white/60">
              {tenantLabel
                ? `Used by the AI for ${tenantLabel} while active.`
                : 'Used by the AI while active.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded-lg p-1.5 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label
              htmlFor="knowledge-title"
              className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-white/60"
            >
              Title
            </label>
            <input
              id="knowledge-title"
              ref={titleInputRef}
              type="text"
              value={form.title}
              maxLength={500}
              onChange={(event) => onFormChange({ ...form, title: event.target.value })}
              placeholder="e.g. Business hours"
              className={KNOWLEDGE_FIELD_CLASS}
            />
          </div>

          <div>
            <label
              htmlFor="knowledge-content"
              className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-white/60"
            >
              Content
            </label>
            <textarea
              id="knowledge-content"
              value={form.content}
              rows={8}
              onChange={(event) => onFormChange({ ...form, content: event.target.value })}
              placeholder="Write the full article the AI should learn from…"
              className={`${KNOWLEDGE_FIELD_CLASS} resize-y`}
            />
          </div>

          <div>
            <label
              htmlFor="knowledge-category"
              className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-white/60"
            >
              Category
            </label>
            <input
              id="knowledge-category"
              type="text"
              value={form.category}
              list={CATEGORY_LIST_ID}
              maxLength={200}
              onChange={(event) => onFormChange({ ...form, category: event.target.value })}
              placeholder="general"
              className={KNOWLEDGE_FIELD_CLASS}
            />
            <datalist id={CATEGORY_LIST_ID}>
              {KNOWLEDGE_CATEGORIES.map((category) => (
                <option key={category} value={category} />
              ))}
            </datalist>
            <p className="mt-1 text-[11px] text-white/40">
              Leave blank to file this entry under General.
            </p>
          </div>

          <div className="flex items-center justify-between gap-4 rounded-lg border border-white/10 bg-white/5 p-3">
            <div>
              <p className="text-sm font-medium text-white">Active</p>
              <p className="text-xs text-white/60">
                {form.is_active
                  ? 'This entry is used by the AI'
                  : 'This entry is hidden from the AI'}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={form.is_active}
              aria-label="Toggle entry visibility"
              onClick={() => onFormChange({ ...form, is_active: !form.is_active })}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
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

          {errors.length > 0 && (
            <ul
              role="alert"
              className="space-y-1 rounded-lg border border-red-500/30 bg-red-500/15 p-3 text-xs text-red-300"
            >
              {errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] flex-1 rounded-lg border border-white/10 text-sm font-medium text-white transition-colors hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={busy}
            aria-busy={busy}
            className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-cyan-500 text-sm font-semibold text-white shadow-lg shadow-cyan-500/10 transition-all hover:from-blue-500 hover:to-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {editing ? 'Update entry' : 'Create entry'}
          </button>
        </div>
      </div>
    </div>
  );
}
