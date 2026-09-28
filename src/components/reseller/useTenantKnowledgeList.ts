'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KnowledgeItem } from '@/lib/reseller/tenant-knowledge-engine';
import {
  listTenantKnowledge,
  type KnowledgeListResult,
} from '@/lib/reseller/tenant-knowledge-client';
import { filterKnowledgeItems, type KnowledgeFilter } from '@/lib/reseller/tenant-knowledge-ui';

/**
 * Phase 4.4 — Tenant knowledge read model.
 *
 * Owns loading, reloading, search/category filtering and the transient notice
 * banner. Row primitives are exposed under `rows` so the write model can keep
 * this list in sync (optimistic toggle, permanent removal) without owning the
 * underlying state.
 */

export type KnowledgeNotice = { type: 'success' | 'error'; message: string } | null;

export type KnowledgeEmptyReason = 'empty' | 'no-results' | null;

const NOTICE_TIMEOUT_MS = 4500;

export interface TenantKnowledgeRowWriter {
  /** Replaces a row wholesale — used after a successful PATCH response. */
  patchItem: (item: KnowledgeItem) => void;
  /** Flips a row's visibility flag — used for the optimistic update and revert. */
  setItemActive: (id: string, isActive: boolean) => void;
  /** Drops a row — used after a permanent delete. */
  removeItem: (id: string) => void;
}

export interface TenantKnowledgeListController {
  items: KnowledgeItem[];
  visibleItems: KnowledgeItem[];
  loading: boolean;
  loadError: string | null;
  activeCount: number;
  emptyReason: KnowledgeEmptyReason;
  query: string;
  setQuery: (value: string) => void;
  filter: KnowledgeFilter;
  setFilter: (value: KnowledgeFilter) => void;
  reload: () => Promise<void>;
  notice: KnowledgeNotice;
  showNotice: (next: NonNullable<KnowledgeNotice>) => void;
  dismissNotice: () => void;
}

export function useTenantKnowledgeList(
  tenantId: string,
): TenantKnowledgeListController & { rows: TenantKnowledgeRowWriter } {
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<KnowledgeFilter>('all');
  const [notice, setNotice] = useState<KnowledgeNotice>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showNotice = useCallback((next: NonNullable<KnowledgeNotice>) => {
    setNotice(next);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), NOTICE_TIMEOUT_MS);
  }, []);

  const dismissNotice = useCallback(() => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    setNotice(null);
  }, []);

  // Lifecycle cleanup only — never touches the shared fetch layer.
  useEffect(
    () => () => {
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    },
    [],
  );

  /**
   * Applies a list outcome to state. Kept separate from the transport call so
   * the mount effect can route through an async `.then` callback — the React
   * Compiler rule `react-hooks/set-state-in-effect` rejects setState that is
   * synchronously reachable from an effect body.
   */
  const applyListOutcome = useCallback((outcome: KnowledgeListResult): void => {
    if (outcome.ok) {
      setItems(outcome.items);
      setLoadError(null);
    } else {
      setItems([]);
      setLoadError(outcome.error);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    let ignore = false;
    void listTenantKnowledge(tenantId).then((outcome) => {
      if (ignore) return;
      applyListOutcome(outcome);
    });
    return () => {
      ignore = true;
    };
  }, [tenantId, applyListOutcome]);

  /** Re-fetch for event handlers: post-mutation refresh, Retry and Refresh. */
  const loadEntries = useCallback(async (): Promise<void> => {
    const outcome = await listTenantKnowledge(tenantId);
    applyListOutcome(outcome);
  }, [tenantId, applyListOutcome]);

  /**
   * User-gesture reload. The spinner flags are flipped here rather than inside
   * `loadEntries`, which keeps effect-driven loads free of synchronous updates.
   */
  const reload = useCallback(async (): Promise<void> => {
    setLoading(true);
    setLoadError(null);
    await loadEntries();
  }, [loadEntries]);

  const patchItem = useCallback((item: KnowledgeItem) => {
    setItems((prev) => prev.map((row) => (row.id === item.id ? item : row)));
  }, []);

  const setItemActive = useCallback((id: string, isActive: boolean) => {
    setItems((prev) =>
      prev.map((row) => (row.id === id ? { ...row, is_active: isActive } : row)),
    );
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((row) => row.id !== id));
  }, []);

  // Stable identity so the write model's callbacks are not rebuilt each render.
  const rows = useMemo<TenantKnowledgeRowWriter>(
    () => ({ patchItem, setItemActive, removeItem }),
    [patchItem, setItemActive, removeItem],
  );

  const visibleItems = useMemo(() => {
    const filtered = filterKnowledgeItems(items, query, filter);
    return [...filtered].sort((a, b) => {
      if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
      const left = a.updated_at ?? a.created_at ?? '';
      const right = b.updated_at ?? b.created_at ?? '';
      return right.localeCompare(left);
    });
  }, [items, query, filter]);

  const activeCount = useMemo(() => items.filter((item) => item.is_active).length, [items]);

  const emptyReason: KnowledgeEmptyReason =
    items.length === 0 ? 'empty' : visibleItems.length === 0 ? 'no-results' : null;

  return {
    items,
    visibleItems,
    loading,
    loadError,
    activeCount,
    emptyReason,
    query,
    setQuery,
    filter,
    setFilter,
    reload,
    notice,
    showNotice,
    dismissNotice,
    rows,
  };
}
