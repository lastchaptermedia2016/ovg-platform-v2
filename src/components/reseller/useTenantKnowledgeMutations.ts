'use client';

import { useCallback, useState } from 'react';
import type { KnowledgeItem } from '@/lib/reseller/tenant-knowledge-engine';
import {
  createKnowledgeEntry,
  deleteKnowledgeEntry,
  updateKnowledgeEntry,
} from '@/lib/reseller/tenant-knowledge-client';
import {
  BLANK_KNOWLEDGE_FORM,
  validateKnowledgeForm,
  type KnowledgeFormDraft,
} from '@/lib/reseller/tenant-knowledge-ui';
import type {
  KnowledgeNotice,
  TenantKnowledgeRowWriter,
} from '@/components/reseller/useTenantKnowledgeList';

/**
 * Phase 4.4 — Tenant knowledge write model.
 *
 * Owns the add/edit form draft, the optimistic visibility toggle and the
 * soft-vs-permanent delete confirmation. Row state itself belongs to the read
 * model and is touched only through the injected `rows` primitives, so this
 * hook never duplicates list state. Every request is wrapped in try/finally so
 * busy flags always return to idle.
 */

export interface TenantKnowledgeMutationDeps {
  /** Surfaces a transient success/failure banner. */
  showNotice: (next: NonNullable<KnowledgeNotice>) => void;
  /** Re-reads the list after a create or a soft delete. */
  reload: () => Promise<void>;
  /** Row primitives owned by the read model. */
  rows: TenantKnowledgeRowWriter;
}

export interface TenantKnowledgeMutationController {
  dialogOpen: boolean;
  editing: boolean;
  form: KnowledgeFormDraft;
  formErrors: string[];
  formBusy: boolean;
  setForm: (next: KnowledgeFormDraft) => void;
  openAddDialog: () => void;
  openEditDialog: (item: KnowledgeItem) => void;
  closeDialog: () => void;
  submitForm: () => Promise<void>;
  toggleBusyId: string | null;
  toggleVisibility: (item: KnowledgeItem) => Promise<void>;
  deleteTarget: KnowledgeItem | null;
  permanentDelete: boolean;
  deleteBusy: boolean;
  setPermanentDelete: (value: boolean) => void;
  openDeleteDialog: (item: KnowledgeItem) => void;
  closeDeleteDialog: () => void;
  confirmDelete: () => Promise<void>;
}

export function useTenantKnowledgeMutations(
  tenantId: string,
  deps: TenantKnowledgeMutationDeps,
): TenantKnowledgeMutationController {
  const { showNotice, reload, rows } = deps;
  const { patchItem, setItemActive, removeItem } = rows;

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<KnowledgeFormDraft>(BLANK_KNOWLEDGE_FORM);
  const [formErrors, setFormErrors] = useState<string[]>([]);
  const [formBusy, setFormBusy] = useState(false);

  const [toggleBusyId, setToggleBusyId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<KnowledgeItem | null>(null);
  const [permanentDelete, setPermanentDelete] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  // ── Add / edit dialog ──────────────────────────────────────────────────────
  const resetForm = useCallback(() => {
    setEditingId(null);
    setForm(BLANK_KNOWLEDGE_FORM);
    setFormErrors([]);
    setFormBusy(false);
  }, []);

  const closeDialog = useCallback(() => {
    setDialogOpen(false);
    resetForm();
  }, [resetForm]);

  const openAddDialog = useCallback(() => {
    resetForm();
    setDialogOpen(true);
  }, [resetForm]);

  const openEditDialog = useCallback((item: KnowledgeItem) => {
    setEditingId(item.id);
    setForm({
      title: item.title,
      content: item.content,
      category: item.category ?? '',
      is_active: item.is_active,
    });
    setFormErrors([]);
    setFormBusy(false);
    setDialogOpen(true);
  }, []);

  const submitForm = useCallback(async (): Promise<void> => {
    if (!tenantId) return;

    const validation = validateKnowledgeForm(form);
    if (!validation.ok) {
      setFormErrors(validation.errors);
      showNotice({ type: 'error', message: validation.errors.join(' ') });
      return;
    }

    setFormErrors([]);
    setFormBusy(true);

    const values = validation.values;
    const targetId = editingId;

    try {
      const outcome =
        targetId !== null
          ? await updateKnowledgeEntry(targetId, {
              title: values.title,
              content: values.content,
              category: values.category,
              is_active: values.is_active,
            })
          : await createKnowledgeEntry({
              tenantId,
              title: values.title,
              content: values.content,
              category: values.category,
              isActive: values.is_active,
            });

      if (!outcome.ok) {
        showNotice({ type: 'error', message: outcome.error });
        return;
      }

      closeDialog();
      showNotice({
        type: 'success',
        message: targetId !== null ? 'Knowledge entry updated' : 'Knowledge entry created',
      });
      await reload();
    } finally {
      setFormBusy(false);
    }
  }, [form, editingId, tenantId, showNotice, closeDialog, reload]);

  // ── Delete confirmation ────────────────────────────────────────────────────
  const closeDeleteDialog = useCallback(() => {
    setDeleteTarget(null);
    setPermanentDelete(false);
  }, []);

  const openDeleteDialog = useCallback((item: KnowledgeItem) => {
    setDeleteTarget(item);
    setPermanentDelete(false);
  }, []);

  /** Optimistic visibility toggle — reverts the row if the PATCH fails. */
  const toggleVisibility = useCallback(
    async (item: KnowledgeItem): Promise<void> => {
      if (toggleBusyId !== null) return;

      const nextActive = !item.is_active;
      setToggleBusyId(item.id);
      setItemActive(item.id, nextActive);

      try {
        const outcome = await updateKnowledgeEntry(item.id, { is_active: nextActive });
        if (!outcome.ok) {
          setItemActive(item.id, item.is_active);
          showNotice({ type: 'error', message: outcome.error });
          return;
        }
        patchItem(outcome.item);
        showNotice({
          type: 'success',
          message: nextActive ? 'Entry activated' : 'Entry deactivated',
        });
      } finally {
        setToggleBusyId(null);
      }
    },
    [toggleBusyId, showNotice, setItemActive, patchItem],
  );

  const confirmDelete = useCallback(async (): Promise<void> => {
    const target = deleteTarget;
    if (!target) return;

    setDeleteBusy(true);
    try {
      const outcome = await deleteKnowledgeEntry(target.id, { permanent: permanentDelete });
      if (!outcome.ok) {
        showNotice({ type: 'error', message: outcome.error });
        return;
      }

      closeDeleteDialog();
      showNotice({
        type: 'success',
        message:
          outcome.mode === 'permanent'
            ? 'Entry permanently deleted'
            : 'Entry deactivated and hidden from the AI',
      });

      if (outcome.mode === 'permanent') {
        removeItem(target.id);
      } else {
        await reload();
      }
    } finally {
      setDeleteBusy(false);
    }
  }, [deleteTarget, permanentDelete, showNotice, closeDeleteDialog, reload, removeItem]);

  return {
    dialogOpen,
    editing: editingId !== null,
    form,
    formErrors,
    formBusy,
    setForm,
    openAddDialog,
    openEditDialog,
    closeDialog,
    submitForm,
    toggleBusyId,
    toggleVisibility,
    deleteTarget,
    permanentDelete,
    deleteBusy,
    setPermanentDelete,
    openDeleteDialog,
    closeDeleteDialog,
    confirmDelete,
  };
}
