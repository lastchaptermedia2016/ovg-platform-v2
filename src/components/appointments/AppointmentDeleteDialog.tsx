'use client';

/**
 * @file AppointmentDeleteDialog.tsx
 *
 * Hard-delete confirmation dialog for a single appointment/lead row in the
 * Appointment Requests dashboard.
 *
 * Deliberately self-contained (Client surface, mounted by
 * AppointmentsDashboard under /client/dashboard/appointments) — it does NOT
 * import the Reseller-domain TenantKnowledgeDeleteDialog per the workspace
 * scope-isolation rules. Styling mirrors the shared dialog pattern:
 * fixed overlay, role="dialog", Escape-to-close, busy state on confirm.
 *
 * A delete is a permanent removal of the row (no soft-delete flag exists on
 * tenant_appointments; ARCHIVED is the CRM's soft state), so the copy makes
 * the irreversibility explicit before the user confirms.
 */

import { useCallback, useEffect } from 'react';
import { Loader2, Trash2 } from 'lucide-react';

export interface AppointmentDeleteDialogProps {
  /** Visitor name shown in the title — falls back to a generic label. */
  title: string;
  /** True while the DELETE request is in flight. */
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function AppointmentDeleteDialog({
  title,
  busy,
  onConfirm,
  onClose,
}: AppointmentDeleteDialogProps) {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (busy) return;
      onClose();
    },
    [busy, onClose],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const safeClose = useCallback(() => {
    if (!busy) onClose();
  }, [busy, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="appointment-delete-title"
        aria-describedby="appointment-delete-desc"
        className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-950 p-6 shadow-2xl"
      >
        <div className="mb-4 flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-500/15">
            <Trash2 className="h-5 w-5 text-red-400" aria-hidden />
          </div>
          <div className="min-w-0">
            <h2 id="appointment-delete-title" className="text-base font-semibold tracking-normal text-white font-agrandir">
              Delete “{title}”?
            </h2>
            <p id="appointment-delete-desc" className="mt-1 text-sm leading-relaxed tracking-normal text-white/60 font-agrandir">
              This permanently removes the lead from your dashboard. It cannot be undone — if you
              only want to dismiss it, use Archive instead.
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row">
          <button
            type="button"
            onClick={safeClose}
            disabled={busy}
            className="min-h-[44px] flex-1 whitespace-nowrap rounded-lg border border-white/10 px-4 text-sm font-medium tracking-normal text-white transition-colors hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50 font-agrandir"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            aria-busy={busy}
            className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-red-600 px-4 text-sm font-semibold tracking-normal text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50 font-agrandir"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            Delete permanently
          </button>
        </div>
      </div>
    </div>
  );
}

