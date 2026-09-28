'use client';

import { useEffect } from 'react';
import { Loader2, Trash2 } from 'lucide-react';

/**
 * Phase 4.4 — Delete confirmation dialog (controlled + presentational).
 *
 * Exposes both destructive paths the API supports: the default soft-delete
 * (`is_active = false`, recoverable) and the opt-in permanent delete
 * (`?permanent=true`). Mounted only while a target is selected.
 */

interface TenantKnowledgeDeleteDialogProps {
  title: string;
  permanent: boolean;
  busy: boolean;
  onPermanentChange: (next: boolean) => void;
  onConfirm: () => void;
  onClose: () => void;
}

export function TenantKnowledgeDeleteDialog({
  title,
  permanent,
  busy,
  onPermanentChange,
  onConfirm,
  onClose,
}: TenantKnowledgeDeleteDialogProps) {
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
        aria-labelledby="knowledge-delete-title"
        className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-950 p-6 shadow-2xl"
      >
        <div className="mb-4 flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-500/15">
            <Trash2 className="h-5 w-5 text-red-400" />
          </div>
          <div className="min-w-0">
            <h2 id="knowledge-delete-title" className="text-base font-semibold text-white">
              Delete “{title}”?
            </h2>
            <p className="mt-1 text-sm text-white/60">
              {permanent
                ? 'The row is removed from the database. This cannot be undone.'
                : 'The entry is deactivated so the AI stops using it. You can reactivate it later.'}
            </p>
          </div>
        </div>

        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-white/10 bg-white/5 p-3">
          <input
            type="checkbox"
            checked={permanent}
            onChange={(event) => onPermanentChange(event.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-red-500"
          />
          <span className="text-xs text-white/70">
            <span className="block text-sm font-medium text-white">Delete permanently</span>
            Skip the soft-delete safety net and remove the row entirely.
          </span>
        </label>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] flex-1 rounded-lg border border-white/10 text-sm font-medium text-white transition-colors hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            aria-busy={busy}
            className="inline-flex min-h-[40px] flex-1 items-center justify-center gap-2 rounded-lg bg-red-600 text-sm font-semibold text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {permanent ? 'Delete permanently' : 'Deactivate entry'}
          </button>
        </div>
      </div>
    </div>
  );
}
