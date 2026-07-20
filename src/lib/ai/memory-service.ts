/**
 * @file memory-service.ts
 *
 * Client relational-memory service for the ZEEDER AI concierge.
 *
 * Backed by the `client_memories` table (see
 * supabase/migrations/20260716_create_client_memories.sql). Each row is a single
 * key/value fact about a client within a tenant, keyed by
 * UNIQUE(tenant_id, client_id, memory_key) so writes are idempotent upserts.
 *
 * Two memory axes are modeled:
 *   - Identity Memory  — who the assistant IS (sourced from the tenant row, not
 *                        here).
 *   - Relational Memory — who the assistant is TALKING TO (client_name,
 *                        company_name, preferences, prior context), stored here
 *                        and recalled on every turn.
 *
 * All writes go through the service-role client (`supabaseAdmin`) so memory
 * persistence is never blocked by row-level-security policies that apply to the
 * authenticated session client. Reads are equally admin-scoped for speed and
 * to avoid RLS round-trips on the hot path.
 */

import { supabaseAdmin } from '@/lib/supabase/admin';

// ──────────────────────────── Known memory keys ────────────────────────────

/**
 * Canonical memory keys. Using a const union prevents typos in call sites and
 * keeps the upsert surface small and intentional.
 */
export const MEMORY_KEYS = {
  CLIENT_NAME: 'client_name',
  COMPANY_NAME: 'company_name',
  PREFERENCES: 'preferences',
} as const;

export type MemoryKey = (typeof MEMORY_KEYS)[keyof typeof MEMORY_KEYS];

/** A flat map of memory_key → memory_value for a single client. */
export type ClientMemoryMap = Record<string, string>;

// ──────────────────────────── Extraction core ────────────────────────────

import Groq from 'groq-sdk';

interface ExtractedFacts {
  client_name?: string | null;
  company_name?: string | null;
  preferences?: string | null;
}

/**
 * Shared LLM extraction pass. Returns parsed facts or null on any failure.
 * This is the single Groq call used by both authenticated and anonymous paths.
 */
async function extractFacts(userMessage: string): Promise<ExtractedFacts | null> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey || !userMessage?.trim()) return null;

  try {
    const groq = new Groq({ apiKey });

    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      temperature: 0,
      max_tokens: 200,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'You extract durable personal facts a user shares in a chat with a business assistant. ' +
            'Return STRICT JSON: {"client_name": string|null, "company_name": string|null, "preferences": string|null}. ' +
            'Set a field to null if the message does not disclose it. ' +
            'Only capture explicit, stable facts (the user\'s own name, their company name, or a clear standing preference). ' +
            'Never invent values. Output only the JSON object.',
        },
        {
          role: 'user',
          content: userMessage,
        },
      ],
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) return null;

    try {
      return JSON.parse(content) as ExtractedFacts;
    } catch {
      return null;
    }
  } catch (err) {
    console.error('[memory-service] extractFacts failed:', err);
    return null;
  }
}

// ──────────────────────────── Authenticated client memory ────────────────────────────
// (client_memories: keyed by tenant + authenticated userId)

/**
 * Fetch all active key/value memory pairs for a specific client.
 *
 * Returns an empty object (never throws) when the client has no memories or the
 * lookup fails, so callers can safely spread it into the prompt builder.
 *
 * @param tenantId - The tenant UUID (tenants.id).
 * @param clientId - The active user/session id the memory is about.
 */
export async function getClientMemories(
  tenantId: string | null,
  clientId: string | null,
): Promise<ClientMemoryMap> {
  if (!tenantId || !clientId) return {};

  try {
    const { data, error } = await supabaseAdmin
      .from('client_memories')
      .select('memory_key, memory_value')
      .eq('tenant_id', tenantId)
      .eq('client_id', clientId);

    if (error || !data) return {};

    const memories: ClientMemoryMap = {};
    for (const row of data) {
      if (row?.memory_key && typeof row.memory_value === 'string') {
        memories[row.memory_key] = row.memory_value;
      }
    }
    return memories;
  } catch (err) {
    console.error('[memory-service] getClientMemories failed:', err);
    return {};
  }
}

/**
 * Upsert a single memory fact for a client.
 *
 * Uses `onConflict: 'tenant_id,client_id,memory_key'` so repeated writes to the
 * same key update `memory_value` + `updated_at` instead of duplicating rows.
 *
 * @param tenantId - The tenant UUID (tenants.id).
 * @param clientId - The active user/session id the memory is about.
 * @param key - A canonical memory key (see {@link MEMORY_KEYS}).
 * @param value - The fact value (already sanitized by the caller).
 */
export async function saveClientMemory(
  tenantId: string | null,
  clientId: string | null,
  key: string,
  value: string,
): Promise<void> {
  if (!tenantId || !clientId || !key || value == null) return;

  try {
    const { error } = await supabaseAdmin.from('client_memories').upsert(
      {
        tenant_id: tenantId,
        client_id: clientId,
        memory_key: key,
        memory_value: value,
      },
      { onConflict: 'tenant_id,client_id,memory_key' },
    );

    if (error) {
      console.error('[memory-service] saveClientMemory upsert failed:', error);
    }
  } catch (err) {
    console.error('[memory-service] saveClientMemory failed:', err);
  }
}

/**
 * Lightweight, best-effort memory extraction for authenticated users.
 *
 * Runs a quick, isolated structured-LLM pass over the user's message to detect
 * self-disclosed facts (name, business name, standing preferences) and upserts
 * any that are found. Designed to be fired-and-forgotten: it is awaited only
 * opportunistically and NEVER blocks the core chat response loop.
 *
 * Failures (missing key, malformed JSON, transport error) are swallowed — a
 * memory miss is non-fatal and the next turn can retry.
 *
 * @param tenantId - The tenant UUID (tenants.id).
 * @param clientId - The active user/session id the memory is about.
 * @param userMessage - The latest user utterance to scan for facts.
 */
export async function extractAndStoreMemories(
  tenantId: string | null,
  clientId: string | null,
  userMessage: string,
): Promise<void> {
  if (!tenantId || !clientId || !userMessage?.trim()) return;

  const extracted = await extractFacts(userMessage);
  if (!extracted) return;

  const writes: Array<[MemoryKey, unknown]> = [
    [MEMORY_KEYS.CLIENT_NAME, extracted.client_name],
    [MEMORY_KEYS.COMPANY_NAME, extracted.company_name],
    [MEMORY_KEYS.PREFERENCES, extracted.preferences],
  ];

  await Promise.all(
    writes
      .filter(([, v]) => typeof v === 'string' && v.trim().length > 0)
      .map(([key, v]) => saveClientMemory(tenantId, clientId, key, String(v).trim().slice(0, 1000))),
  );
}

// ──────────────────────────── Anonymous visitor memory ────────────────────────────
// (visitor_memories: keyed by tenant + self-reported contact detail)

export type VisitorIdentityType = 'phone' | 'email';
export type VisitorMemoryMap = Record<string, string>;

/**
 * Normalize a phone number for lookup/storage. Matches the format used by
 * booking-capture.ts so identity matches work across the booking and memory
 * systems.
 */
export function normalizeVisitorPhone(value: string | null | undefined): string | null {
  if (!value) return null;
  const plus = value.trim().startsWith('+') ? '+' : '';
  const digits = value.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) return null;
  return `${plus}${digits}`.slice(0, 20);
}

/**
 * Normalize an email for lookup/storage. Lowercase, trim, length-cap.
 */
export function normalizeVisitorEmail(value: string | null | undefined): string | null {
  if (!value) return null;
  const norm = value.trim().toLowerCase();
  if (norm.length === 0 || norm.length > 255) return null;
  return norm;
}

/**
 * Fetch all active key/value memory pairs for an anonymous visitor identified
 * by contact detail.
 *
 * Returns an empty object (never throws) on failure.
 */
export async function getVisitorMemories(
  tenantId: string | null,
  identityType: VisitorIdentityType,
  identityValue: string | null,
): Promise<VisitorMemoryMap> {
  if (!tenantId || !identityType || !identityValue) return {};

  try {
    const { data, error } = await supabaseAdmin
      .from('visitor_memories')
      .select('memory_key, memory_value')
      .eq('tenant_id', tenantId)
      .eq('identity_type', identityType)
      .eq('identity_value', identityValue);

    if (error || !data) return {};

    const memories: VisitorMemoryMap = {};
    for (const row of data) {
      if (row?.memory_key && typeof row.memory_value === 'string') {
        memories[row.memory_key] = row.memory_value;
      }
    }
    return memories;
  } catch (err) {
    console.error('[memory-service] getVisitorMemories failed:', err);
    return {};
  }
}

/**
 * Upsert a single memory fact for an anonymous visitor.
 *
 * Uses `onConflict: 'tenant_id,identity_type,identity_value,memory_key'` so
 * repeated writes update `memory_value` + `updated_at` + `last_seen_at`.
 */
export async function saveVisitorMemory(
  tenantId: string | null,
  identityType: VisitorIdentityType,
  identityValue: string | null,
  key: string,
  value: string,
): Promise<void> {
  if (!tenantId || !identityType || !identityValue || !key || value == null) return;

  try {
    const { error } = await supabaseAdmin.from('visitor_memories').upsert(
      {
        tenant_id: tenantId,
        identity_type: identityType,
        identity_value: identityValue,
        memory_key: key,
        memory_value: value,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: 'tenant_id,identity_type,identity_value,memory_key' },
    );

    if (error) {
      console.error('[memory-service] saveVisitorMemory upsert failed:', error);
    }
  } catch (err) {
    console.error('[memory-service] saveVisitorMemory failed:', err);
  }
}

/**
 * Update last_seen_at for an anonymous visitor without changing any memory
 * values. Called after a successful chat turn to keep the retention window
 * current.
 */
export async function touchVisitorMemory(
  tenantId: string | null,
  identityType: VisitorIdentityType,
  identityValue: string | null,
): Promise<void> {
  if (!tenantId || !identityType || !identityValue) return;

  try {
    const { error } = await supabaseAdmin
      .from('visitor_memories')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('tenant_id', tenantId)
      .eq('identity_type', identityType)
      .eq('identity_value', identityValue);

    if (error) {
      console.error('[memory-service] touchVisitorMemory update failed:', error);
    }
  } catch (err) {
    console.error('[memory-service] touchVisitorMemory failed:', err);
  }
}

/**
 * Lightweight, best-effort memory extraction for anonymous visitors.
 *
 * Identical extraction logic to `extractAndStoreMemories`, but persists facts
 * to `visitor_memories` keyed by contact detail instead of `client_memories`
 * keyed by userId.
 *
 * Also updates `last_seen_at` on the visitor identity row to maintain the
 * retention window.
 */
export async function extractAndStoreVisitorMemories(
  tenantId: string | null,
  identityType: VisitorIdentityType,
  identityValue: string | null,
  userMessage: string,
): Promise<void> {
  if (!tenantId || !identityType || !identityValue || !userMessage?.trim()) return;

  const extracted = await extractFacts(userMessage);
  if (!extracted) return;

  const writes: Array<[MemoryKey, unknown]> = [
    [MEMORY_KEYS.CLIENT_NAME, extracted.client_name],
    [MEMORY_KEYS.COMPANY_NAME, extracted.company_name],
    [MEMORY_KEYS.PREFERENCES, extracted.preferences],
  ];

  await Promise.all(
    writes
      .filter(([, v]) => typeof v === 'string' && v.trim().length > 0)
      .map(([key, v]) => saveVisitorMemory(tenantId, identityType, identityValue, key, String(v).trim().slice(0, 1000))),
  );

  void touchVisitorMemory(tenantId, identityType, identityValue);
}

/**
 * Delete visitor memories that have not been seen within the retention window.
 * Intended to be called periodically (daily via scheduled job, or
 * opportunistically from the process-command route).
 *
 * @param retentionDays - Inactivity threshold in days (default: 365).
 * @returns Number of rows deleted.
 */
export async function cleanupExpiredVisitorMemories(retentionDays: number = 365): Promise<number> {
  try {
    const { data, error } = await supabaseAdmin.rpc('cleanup_expired_visitor_memories', {
      p_retention_days: retentionDays,
    });
    if (error) {
      console.error('[memory-service] cleanupExpiredVisitorMemories failed:', error);
      return 0;
    }
    return (data as number[] | null)?.[0] ?? 0;
  } catch (err) {
    console.error('[memory-service] cleanupExpiredVisitorMemories failed:', err);
    return 0;
  }
}
