'use client';

import { useCallback } from 'react';
import { TenantKnowledgeDeleteDialog } from '@/components/reseller/tenant-knowledge-delete-dialog';
import { TenantKnowledgeEntryDialog } from '@/components/reseller/tenant-knowledge-entry-dialog';
import { TenantKnowledgeList } from '@/components/reseller/tenant-knowledge-list';
import { TenantKnowledgeToolbar } from '@/components/reseller/tenant-knowledge-toolbar';
import { useTenantKnowledge } from '@/components/reseller/useTenantKnowledge';
import type { KnowledgeItem } from '@/lib/reseller/tenant-knowledge-engine';

/**
 * Phase 4.4 — Tenant knowledge CRUD table.
 *
 * Thin composition root: the controller hook owns the state machine, the
 * toolbar and list own presentation, and the two dialogs own their forms. The
 * parent remounts this component per tenant (`key={tenantId}`) so tenant
 * switches never render stale rows.
 */

interface TenantKnowledgeTableProps {
  tenantId: string;
  tenantLabel?: string;
  hideToolbar?: boolean;
}

export function TenantKnowledgeTable({ tenantId, tenantLabel, hideToolbar = false }: TenantKnowledgeTableProps) {
  const {
    items,
    visibleItems,
    activeCount,
    emptyReason,
    loading,
    loadError,
    query,
    setQuery,
    filter,
    setFilter,
    reload,
    notice,
    dismissNotice,
    dialogOpen,
    editing,
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
  } = useTenantKnowledge(tenantId);

  const handleRefresh = useCallback(() => {
    void reload();
  }, [reload]);

  const handleToggle = useCallback(
    (item: KnowledgeItem) => {
      void toggleVisibility(item);
    },
    [toggleVisibility],
  );

  const handleSubmit = useCallback(() => {
    void submitForm();
  }, [submitForm]);

  const handleConfirmDelete = useCallback(() => {
    void confirmDelete();
  }, [confirmDelete]);

  return (
    <div className="space-y-5">
      {!hideToolbar && (
        <TenantKnowledgeToolbar
          query={query}
          onQueryChange={setQuery}
          filter={filter}
          onFilterChange={setFilter}
          loading={loading}
          onRefresh={handleRefresh}
          onAdd={openAddDialog}
          notice={notice}
          onDismissNotice={dismissNotice}
        />
      )}

      <TenantKnowledgeList
        items={items}
        visibleItems={visibleItems}
        activeCount={activeCount}
        emptyReason={emptyReason}
        loading={loading}
        loadError={loadError}
        query={query}
        filter={filter}
        toggleBusyId={toggleBusyId}
        tenantLabel={tenantLabel}
        onRetry={handleRefresh}
        onAdd={openAddDialog}
        onEdit={openEditDialog}
        onToggle={handleToggle}
        onDelete={openDeleteDialog}
      />

      {/* Add / edit dialog */}
      {dialogOpen && (
        <TenantKnowledgeEntryDialog
          editing={editing}
          tenantLabel={tenantLabel}
          form={form}
          errors={formErrors}
          busy={formBusy}
          onFormChange={setForm}
          onSubmit={handleSubmit}
          onClose={closeDialog}
        />
      )}

      {/* Delete confirmation */}
      {deleteTarget && (
        <TenantKnowledgeDeleteDialog
          title={deleteTarget.title}
          permanent={permanentDelete}
          busy={deleteBusy}
          onPermanentChange={setPermanentDelete}
          onConfirm={handleConfirmDelete}
          onClose={closeDeleteDialog}
        />
      )}
    </div>
  );
}
