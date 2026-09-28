import { z } from 'zod';
import type { KnowledgeItem } from '@/lib/reseller/tenant-knowledge-engine';

/**
 * Phase 4.4 — Tenant Knowledge transport layer.
 *
 * Typed `fetch` wrapper around the Phase 4.2 CRUD endpoints:
 *   GET    /api/reseller/tenant-knowledge?tenantId=<uuid>
 *   POST   /api/reseller/tenant-knowledge
 *   PATCH  /api/reseller/tenant-knowledge/[id]
 *   DELETE /api/reseller/tenant-knowledge/[id]?permanent=true
 *
 * Every function resolves to an `{ ok, ... }` union — network failures,
 * non-2xx statuses, and `{ error: string }` payloads are surfaced as
 * `{ ok: false, error }` and are never thrown, so callers never need a
 * `try/catch` around a network call.
 *
 * This module is DELIBERATELY transport-only. Form validation, category
 * metadata, and list filtering live in `@/lib/reseller/tenant-knowledge-ui`.
 * Do not re-introduce UI helpers here — duplicated form schemas already
 * diverged once between the two modules.
 */

const LIST_PATH = '/api/reseller/tenant-knowledge';

const itemPath = (id: string): string =>
  `/api/reseller/tenant-knowledge/${encodeURIComponent(id)}`;

const UuidSchema = z.string().uuid('Invalid tenant ID');

export interface KnowledgeListSuccess {
  ok: true;
  items: KnowledgeItem[];
}

export interface KnowledgeItemSuccess {
  ok: true;
  item: KnowledgeItem;
}

export interface KnowledgeDeleteSuccess {
  ok: true;
  mode: 'soft' | 'permanent';
}

export interface KnowledgeApiFailure {
  ok: false;
  error: string;
}

export type KnowledgeListResult = KnowledgeListSuccess | KnowledgeApiFailure;
export type KnowledgeItemResult = KnowledgeItemSuccess | KnowledgeApiFailure;
export type KnowledgeDeleteResult = KnowledgeDeleteSuccess | KnowledgeApiFailure;

/** Body contract for `POST /api/reseller/tenant-knowledge`. */
export interface KnowledgeCreateInput {
  tenantId: string;
  title: string;
  content: string;
  category?: string | null;
  isActive?: boolean;
}

/** Body contract for `PATCH /api/reseller/tenant-knowledge/[id]` (partial). */
export interface KnowledgeUpdateInput {
  title?: string;
  content?: string;
  category?: string | null;
  is_active?: boolean;
}

interface ErrorPayload {
  error?: unknown;
}

function readErrorMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const maybeError = (payload as ErrorPayload).error;
    if (typeof maybeError === 'string' && maybeError.trim() !== '') {
      return maybeError;
    }
  }
  return fallback;
}

function isKnowledgeItem(value: unknown): value is KnowledgeItem {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === 'string' &&
    typeof row.tenant_id === 'string' &&
    typeof row.title === 'string' &&
    typeof row.content === 'string' &&
    typeof row.is_active === 'boolean'
  );
}

async function parseJson(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}

/** GET all knowledge rows for a tenant (the server scopes + authorises). */
export async function listTenantKnowledge(tenantId: string): Promise<KnowledgeListResult> {
  if (!UuidSchema.safeParse(tenantId).success) {
    return { ok: false, error: 'A valid tenant ID is required' };
  }

  let response: Response;
  try {
    response = await fetch(`${LIST_PATH}?tenantId=${encodeURIComponent(tenantId)}`, {
      method: 'GET',
    });
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : 'Network request failed' };
  }

  const payload = await parseJson(response);
  if (!response.ok) {
    return { ok: false, error: readErrorMessage(payload, `Request failed (${response.status})`) };
  }

  const items = (payload as { data?: unknown }).data;
  if (!Array.isArray(items) || !items.every(isKnowledgeItem)) {
    return { ok: false, error: 'Unexpected response shape from knowledge API' };
  }
  return { ok: true, items };
}

/** POST a new knowledge entry — the server stamps the validated tenant_id. */
export async function createKnowledgeEntry(
  input: KnowledgeCreateInput,
): Promise<KnowledgeItemResult> {
  let response: Response;
  try {
    response = await fetch(LIST_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : 'Network request failed' };
  }

  const payload = await parseJson(response);
  if (response.status !== 201) {
    return { ok: false, error: readErrorMessage(payload, `Request failed (${response.status})`) };
  }

  const item = (payload as { data?: unknown }).data;
  if (!isKnowledgeItem(item)) {
    return { ok: false, error: 'Unexpected response shape from knowledge API' };
  }
  return { ok: true, item };
}

/** PATCH a knowledge entry — partial update, always tenant-scoped server-side. */
export async function updateKnowledgeEntry(
  id: string,
  patch: KnowledgeUpdateInput,
): Promise<KnowledgeItemResult> {
  let response: Response;
  try {
    response = await fetch(itemPath(id), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : 'Network request failed' };
  }

  const payload = await parseJson(response);
  if (!response.ok) {
    return { ok: false, error: readErrorMessage(payload, `Request failed (${response.status})`) };
  }

  const item = (payload as { data?: unknown }).data;
  if (!isKnowledgeItem(item)) {
    return { ok: false, error: 'Unexpected response shape from knowledge API' };
  }
  return { ok: true, item };
}

/**
 * DELETE a knowledge entry.
 * Default is a soft-delete (`is_active = false`); `permanent: true`
 * issues a hard delete via `?permanent=true`.
 */
export async function deleteKnowledgeEntry(
  id: string,
  options?: { permanent?: boolean },
): Promise<KnowledgeDeleteResult> {
  const url = options?.permanent === true ? `${itemPath(id)}?permanent=true` : itemPath(id);

  let response: Response;
  try {
    response = await fetch(url, { method: 'DELETE' });
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : 'Network request failed' };
  }

  const payload = await parseJson(response);
  if (!response.ok) {
    return { ok: false, error: readErrorMessage(payload, `Request failed (${response.status})`) };
  }

  const mode = (payload as { mode?: unknown }).mode;
  return { ok: true, mode: mode === 'permanent' ? 'permanent' : 'soft' };
}
