/**
 * Phase 4.2 — Tenant Knowledge Retrieval Engine (RAG context builder)
 *
 * Pure, highly resilient retrieval module used by AI handlers to fetch
 * active tenant knowledge and format it into a Markdown block that is ready
 * for prompt injection.
 *
 * Guarantees:
 *   - Strict multi-tenant isolation: EVERY query is scoped by `tenant_id`
 *     and filtered to `is_active = true`.
 *   - Never throws unhandled errors: Postgrest failures, network throws, and
 *     invalid input all resolve to `{ contextString: '', items, error }`.
 *   - Graceful empty fallback: no active rows ⇒ empty context string with
 *     `error: null` (an empty knowledge base is not an error condition).
 *
 * The optional `query` filter is applied in-memory over title/content rather
 * than via `ilike` — knowledge bases are small per tenant, and substring
 * matching avoids Postgrest wildcard-escaping/injection edge cases entirely.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

/** Active knowledge row surfaced to AI handlers. */
export interface KnowledgeItem {
  id: string;
  tenant_id: string;
  title: string;
  content: string;
  category: string | null;
  is_active: boolean;
  /**
   * Timestamps are present on rows returned by the dashboard CRUD API
   * (`SELECT *`) but are deliberately excluded from the retrieval projection
   * above, so they are optional — never assume they exist.
   */
  created_at?: string;
  updated_at?: string;
}

/** Optional retrieval filters. */
export interface TenantKnowledgeContextOptions {
  category?: string;
  query?: string;
}

/** Retrieval result — always resolvable, never thrown. */
export interface TenantKnowledgeContextResult {
  contextString: string;
  items: KnowledgeItem[];
  error: string | null;
}

/**
 * Formats knowledge items into a clean Markdown block for prompt injection:
 *   ### Q: [Title]
 *   A: [Content]
 */
export function formatKnowledgeContext(items: KnowledgeItem[]): string {
  if (items.length === 0) return '';
  return items.map((item) => `### Q: ${item.title}\nA: ${item.content}`).join('\n\n');
}

/**
 * Fetches active knowledge for a tenant and returns a prompt-ready context
 * string alongside the structured items.
 */
export async function getTenantKnowledgeContext(
  tenantId: string,
  supabaseClient: SupabaseClient,
  options?: TenantKnowledgeContextOptions,
): Promise<TenantKnowledgeContextResult> {
  if (!tenantId || tenantId.trim() === '') {
    return { contextString: '', items: [], error: 'tenantId is required' };
  }

  try {
    // Tenant isolation is the FIRST predicate on every query.
    let builder = supabaseClient
      .from('tenant_knowledge')
      .select('id, tenant_id, title, content, category, is_active')
      .eq('tenant_id', tenantId)
      .eq('is_active', true);

    const category = options?.category?.trim();
    if (category) {
      builder = builder.eq('category', category);
    }

    const { data, error } = await builder.order('created_at', { ascending: true });

    if (error) {
      return { contextString: '', items: [], error: error.message };
    }

    let items = (data ?? []) as KnowledgeItem[];

    const needle = options?.query?.trim().toLowerCase();
    if (needle) {
      items = items.filter(
        (item) =>
          item.title.toLowerCase().includes(needle) ||
          item.content.toLowerCase().includes(needle),
      );
    }

    return { contextString: formatKnowledgeContext(items), items, error: null };
  } catch (err: unknown) {
    return {
      contextString: '',
      items: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
