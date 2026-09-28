'use client';

import {
  useTenantKnowledgeList,
  type TenantKnowledgeListController,
} from '@/components/reseller/useTenantKnowledgeList';
import {
  useTenantKnowledgeMutations,
  type TenantKnowledgeMutationController,
} from '@/components/reseller/useTenantKnowledgeMutations';

/**
 * Phase 4.4 — Tenant knowledge controller façade.
 *
 * Composes the read model (load/reload, search + category filtering, transient
 * notice) with the write model (add/edit form, optimistic visibility toggle,
 * soft-vs-permanent delete confirmation) behind a single hook, so rendering
 * components depend on one stable surface. The read model's internal row
 * primitives are consumed here and deliberately kept out of this contract.
 */

export type TenantKnowledgeController = TenantKnowledgeListController &
  TenantKnowledgeMutationController;

export function useTenantKnowledge(tenantId: string): TenantKnowledgeController {
  const { rows, ...list } = useTenantKnowledgeList(tenantId);
  const mutations = useTenantKnowledgeMutations(tenantId, {
    showNotice: list.showNotice,
    reload: list.reload,
    rows,
  });

  return { ...list, ...mutations };
}
