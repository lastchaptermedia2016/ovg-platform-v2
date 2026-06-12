'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import type { BrandingData, BrandingBag, BrandingFetchResponse } from '@/types';

// ================================================================
// Types
// ================================================================

interface BrandingStudioState {
  /** The staging state — user edits this freely */
  staging: BrandingData;
  /** The last committed state from the DB */
  committed: BrandingData;
  /** Version stamp for optimistic concurrency control */
  version: number;
  /** Whether there are unsaved changes (staging !== committed) */
  isDirty: boolean;
  /** Whether a commit is in flight */
  isSyncing: boolean;
  /** Whether initial data is being loaded */
  isLoading: boolean;
  /** The reseller slug used to initialize the hook */
  resellerSlug: string;
  /** Error message if branding could not be loaded (e.g., invalid slug) */
  error: string | null;
}

interface CommitResult {
  success: boolean;
  conflict?: Record<string, unknown> | null;
  error?: string;
}

interface UseBrandingStudioReturn extends BrandingStudioState {
  /** Update a single branding token in staging */
  updateToken: (key: keyof BrandingData, value: string) => void;
  /** Bulk-update staging (e.g., from AI-generated palette) */
  stageBulk: (partial: Partial<BrandingData>) => void;
  /** Commit staging to the database via POST /api/reseller/[slug]/sync-brand */
  commit: () => Promise<CommitResult>;
  /** Rollback staging to the last committed state */
  rollback: () => void;
  /** CSS custom property string for live preview injection */
  cssVariables: string;
  /** Convert current staging to a BrandingBag for API transmission */
  toBrandingBag: () => BrandingBag;
}

// ================================================================
// Helpers
// ================================================================

/** Convert BrandingData (flat) to BrandingBag (API-compatible) */
function dataToBag(data: BrandingData): BrandingBag {
  return {
    primaryColor: data.primaryColor,
    accentColor: data.accentColor,
    logoUrl: data.logoUrl || null,
    favicon: data.favicon || null,
    metaTitle: data.metaTitle || null,
    metaDescription: data.metaDescription || null,
    websiteUrl: null,
    typography: data.typography ?? { headingFont: 'Inter', bodyFont: 'Inter' },
    borderRadius: data.borderRadius ?? 8,
    mode: data.mode ?? 'light',
  };
}

/** Parse BrandingBag into BrandingData */
function bagToData(name: string, bag: BrandingBag): BrandingData {
  return {
    name,
    logoUrl: bag.logoUrl ?? '',
    primaryColor: bag.primaryColor,
    accentColor: bag.accentColor,
    favicon: bag.favicon ?? undefined,
    metaTitle: bag.metaTitle ?? undefined,
    metaDescription: bag.metaDescription ?? undefined,
    typography: bag.typography ?? { headingFont: 'Inter', bodyFont: 'Inter' },
    borderRadius: bag.borderRadius ?? 8,
    mode: bag.mode ?? 'light',
  };
}

// ================================================================
// Hook
// ================================================================

const DEFAULT_BRANDING: BrandingData = {
  name: '',
  logoUrl: '',
  primaryColor: '#0097b2',
  accentColor: '#D4AF37',
};

/**
 * useBrandingStudio
 *
 * Provides a "Stage-then-Sync" bridge between the Branding Studio UI controls
 * and the database. Key design decisions:
 *
 * - **No DB pressure during editing** — all changes are applied to local React
 *   state and CSS custom properties. Network calls only happen on commit.
 * - **Optimistic concurrency** — version_stamp is compared at commit time via
 *   PostgreSQL's sync_reseller_branding() RPC. Conflicts surface as HTTP 409.
 * - **Atomic rollback** — if the user cancels or a conflict occurs, rollback()
 *   restores staging to the last committed state.
 */
export function useBrandingStudio(resellerSlug: string): UseBrandingStudioReturn {
  const [staging, setStaging] = useState<BrandingData>(DEFAULT_BRANDING);
  const [committed, setCommitted] = useState<BrandingData>(DEFAULT_BRANDING);
  const [version, setVersion] = useState(1);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Derive dirty state — deep comparison of serialized objects
  const isDirty = JSON.stringify(staging) !== JSON.stringify(committed);

  // ================================================================
  // Load initial branding data from the server on mount
  // ================================================================
  useEffect(() => {
    let cancelled = false;

    async function load() {
      // HYDRATION GUARD: Abort if resellerSlug hasn't hydrated yet.
      // Prevents 404 race condition on hard refresh before URL params are ready.
      // The useEffect dependency on resellerSlug will re-run this when it hydrates.
      if (!resellerSlug || resellerSlug === 'undefined') {
        setIsLoading(false);
        return;
      }

      setError(null);
      setIsLoading(true);
      try {
        const url = `/api/reseller/${resellerSlug}/branding`;
        console.debug('[useBrandingStudio] Fetching branding from:', url, 'slug:', resellerSlug);
        const res = await fetch(url);
        if (!res.ok) {
          // DIAGNOSTIC: Log the resolved slug to help debug 404 root causes
          // (e.g. URL-encoded chars, partial hydration artifacts).
          console.error(
            '[useBrandingStudio] Failed to load branding:',
            res.status,
            'slug:', resellerSlug,
          );
          // GRACEFUL FALLBACK: On 404 or UUID-as-slug, set a user-visible error.
          // The UI can render this instead of silently showing defaults.
          const errorMsg =
            res.status === 404
              ? `Reseller "${resellerSlug}" not found. Please contact support.`
              : `Failed to load branding (${res.status}). Please try again.`;
          if (!cancelled) {
            setError(errorMsg);
            setIsLoading(false);
          }
          return;
        }

        const data: BrandingFetchResponse = await res.json();
        if (cancelled) return;

        const loaded = bagToData(data.name, data.brandingBag);
        setStaging(loaded);
        setCommitted(loaded);
        setVersion(data.version);
        setIsLoading(false);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[useBrandingStudio] Load error:', msg);
        if (!cancelled) {
          setError('Network error loading branding configuration. Please try again.');
          setIsLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [resellerSlug]);

  // ================================================================
  // Update a single token in staging
  // ================================================================
  const updateToken = useCallback((key: keyof BrandingData, value: string) => {
    setStaging((prev) => ({ ...prev, [key]: value }));
  }, []);

  // ================================================================
  // Bulk-update staging (e.g., AI palette generation)
  // ================================================================
  const stageBulk = useCallback((partial: Partial<BrandingData>) => {
    setStaging((prev) => ({ ...prev, ...partial }));
  }, []);

  // ================================================================
  // Commit staging to the database
  // ================================================================
  const commit = useCallback(async (): Promise<CommitResult> => {
    setIsSyncing(true);

    try {
      const brandingBag = dataToBag(staging);

      const res = await fetch(`/api/reseller/${resellerSlug}/sync-brand`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: resellerSlug,
          brandingBag,
          expectedVersion: version,
        }),
      });

      const result = await res.json();

      if (res.status === 409) {
        // Conflict detected — preserve conflicted response for UI handling
        console.warn(
          '[useBrandingStudio] Branding conflict:',
          result.conflict,
        );
        return { success: false, conflict: result.conflict };
      }

      if (!res.ok) {
        // Extract server error for descriptive failure
        throw new Error(result.error || 'Commit failed');
      }

      // Update committed state to match staging
      setCommitted({ ...staging });
      setVersion(result.version);

      console.log(
        `[useBrandingStudio] Commit succeeded v${version} → v${result.version}`,
      );

      return { success: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[useBrandingStudio] Commit error:', msg);
      return { success: false, conflict: null, error: msg };
    } finally {
      setIsSyncing(false);
    }
  }, [resellerSlug, staging, version]);

  // ================================================================
  // Rollback staging to the last committed state
  // ================================================================
  const rollback = useCallback(() => {
    setStaging({ ...committed });
  }, [committed]);

  // ================================================================
  // Convert staging to BrandingBag for external use
  // ================================================================
  const toBrandingBag = useCallback((): BrandingBag => {
    return dataToBag(staging);
  }, [staging]);

  // ================================================================
  // Compute CSS custom property string for live preview
  // ================================================================
  const cssVariables = useMemo(() => {
    return `
--brand-primary: ${staging.primaryColor};
--brand-accent: ${staging.accentColor};
--brand-logo: ${staging.logoUrl ? `url('${staging.logoUrl}')` : 'none'};
--brand-border-radius: ${staging.borderRadius ?? 8}px;
--brand-mode: ${staging.mode ?? 'light'};
    `.trim();
  }, [staging]);

  return {
    // State
    staging,
    committed,
    version,
    isDirty,
    isSyncing,
    isLoading,
    error,
    resellerSlug,

    // Actions
    updateToken,
    stageBulk,
    commit,
    rollback,

    // Derived
    cssVariables,
    toBrandingBag,
  };
}