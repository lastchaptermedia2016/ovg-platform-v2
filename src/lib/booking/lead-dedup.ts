import { supabaseAdmin } from '@/lib/supabase/admin';

/**
 * @file lead-dedup.ts
 *
 * Shared appointment-lead deduplication helper.
 *
 * Three write paths used to insert a `tenant_appointments` LEAD row for the
 * same visitor interaction without checking for an existing row:
 *   1. `POST /api/chat/send-anon` (lead-capture interceptor)
 *   2. `POST /api/client/visitor-memories` (CRM lead capture)
 *   3. `POST /api/client/process-command` (SYSTEM_BOOKING_CAPTURE)
 *
 * Every lead write path must go through {@link upsertAppointmentLead}, which
 * finds an existing active LEAD (`status = 'LEAD'`) for the same
 * `tenant_id` + `client_phone` and updates it in place.
 *
 * Client-surface safe: only imports the service-role admin client. No
 * reseller-domain imports, so both surfaces can use it.
 */

export interface UpsertLeadInput {
  tenantId: string;
  clientName: string | null;
  clientPhone: string;
  initialIntent?: string | null;
}

export interface UpsertLeadResult {
  id: string;
  client_name: string | null;
  client_phone: string | null;
  initial_intent: string | null;
  status: string | null;
  created_at: string | null;
}

export interface UpsertLeadOutcome {
  lead: UpsertLeadResult | null;
  /** True when an existing LEAD row was updated instead of inserting. */
  deduped: boolean;
}

const LEAD_SELECT = 'id, client_name, client_phone, initial_intent, status, created_at';
const GENERIC_INTENTS = new Set(['', 'public widget inquiry']);

/** A `Visitor 1234567` label is a phone-derived fallback, not a real name. */
export function isFallbackName(name: string | null | undefined): boolean {
  if (!name) return true;
  const trimmed = name.trim();
  if (!trimmed) return true;
  return /^visitor\b/i.test(trimmed);
}

export function isGenericIntent(intent: string | null | undefined): boolean {
  if (!intent) return true;
  return GENERIC_INTENTS.has(intent.trim().toLowerCase());
}

/**
 * Normalize a phone to compact digits — the canonical insert key.
 *
 * Deliberately strips a leading `+`: the partial unique index
 * `idx_unique_active_tenant_lead` keys on the raw string, so `+2782…` and
 * `2782…` would be treated as different phones and both pass the guard.
 * Storing digits-only keeps every new row on one uniform key.
 * `leadPhoneVariants` still reads legacy `+`-prefixed rows.
 */
export function normalizeLeadPhone(value: string): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) return null;
  return digits.slice(0, 20);
}

/**
 * All stored variants a phone may appear under.
 *
 * Legacy rows exist with and without a leading `+` (some paths preserved it,
 * some stripped it), so the `+digits` form is always included regardless of
 * the input's own formatting — otherwise a digits-only lookup would never
 * match a historical `+`-prefixed row.
 */
export function leadPhoneVariants(rawPhone: string): string[] {
  const digits = rawPhone.replace(/\D/g, '');
  if (!digits) return [];
  const normalized = normalizeLeadPhone(rawPhone);
  const variants = new Set<string>([rawPhone.trim(), digits, `+${digits}`]);
  if (normalized) variants.add(normalized);
  return [...variants].filter((v) => v.length > 0);
}

interface ExistingLead {
  id: string;
  client_name: string | null;
  client_phone: string | null;
  initial_intent: string | null;
  status: string | null;
  created_at: string | null;
}

async function findExistingLead(tenantId: string, variants: string[]): Promise<ExistingLead | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from('tenant_appointments')
      .select(LEAD_SELECT)
      .eq('tenant_id', tenantId)
      .eq('status', 'LEAD')
      .in('client_phone', variants)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return null;
    return (data as ExistingLead | null) ?? null;
  } catch {
    return null;
  }
}

/**
 * Build the in-place upgrade for an existing lead. A real incoming name
 * upgrades a fallback (`Visitor 123`) or fills a missing name, but a
 * fallback never overwrites a real name (e.g. `keith` is preserved).
 * `initial_intent` only fills a missing/generic value, so the visitor's
 * original request is preserved. Returns null when nothing needs changing.
 */
function buildLeadUpgrade(
  existing: ExistingLead,
  cleanName: string | null,
  cleanIntent: string | null,
): Record<string, string> | null {
  const updatePayload: Record<string, string> = {};
  if (!isFallbackName(cleanName) && cleanName !== existing.client_name) {
    updatePayload.client_name = cleanName as string;
  }
  if (cleanIntent && isGenericIntent(existing.initial_intent) && cleanIntent !== existing.initial_intent) {
    updatePayload.initial_intent = cleanIntent;
  }
  return Object.keys(updatePayload).length > 0 ? updatePayload : null;
}

function toOutcomeLead(row: ExistingLead): UpsertLeadResult {
  return {
    id: row.id,
    client_name: row.client_name,
    client_phone: row.client_phone,
    initial_intent: row.initial_intent,
    status: row.status,
    created_at: row.created_at,
  };
}

/** True for a Postgres unique-violation (concurrent insert won the race). */
function isUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  return (err as { code?: unknown }).code === '23505';
}

/**
 * Insert a LEAD row, or update the existing active LEAD for the same
 * tenant + phone instead of creating a duplicate.
 *
 * Check-then-act with a database backstop: the fast-path SELECT finds an
 * existing lead in the common sequential case, while the partial unique
 * index `idx_unique_active_tenant_lead` (tenant_id, client_phone WHERE
 * status = 'LEAD' AND client_phone IS NOT NULL) serializes truly
 * concurrent inserts. A `23505` unique-violation on INSERT means a sibling
 * request won the race — we re-query the winner and apply the name/intent
 * upgrade in place, so concurrent callers converge on one row.
 *
 * Matching: most recent row with `status = 'LEAD'` for the tenant whose
 * `client_phone` matches any stored variant of the phone. The
 * `status = 'LEAD'` predicate is the active-state check — CONTACTED and
 * ARCHIVED rows are terminal CRM states and are never resurrected.
 */
export async function upsertAppointmentLead(input: UpsertLeadInput): Promise<UpsertLeadOutcome> {
  const { tenantId, clientName, clientPhone, initialIntent } = input;
  const variants = leadPhoneVariants(clientPhone);
  if (!tenantId || variants.length === 0) {
    return { lead: null, deduped: false };
  }
  const cleanName = clientName?.trim() ? clientName.trim().slice(0, 120) : null;
  const cleanIntent = initialIntent?.trim() ? initialIntent.trim().slice(0, 1000) : null;
  const nowIso = new Date().toISOString();

  const existing = await findExistingLead(tenantId, variants);

  if (!existing) {
    const canonical = normalizeLeadPhone(clientPhone) ?? clientPhone.trim();
    const { data: inserted, error: insertError } = await supabaseAdmin
      .from('tenant_appointments')
      .insert({
        tenant_id: tenantId,
        client_name: cleanName,
        client_phone: canonical,
        status: 'LEAD',
        initial_intent: cleanIntent,
        start_time: nowIso,
        end_time: nowIso,
      })
      .select(LEAD_SELECT)
      .maybeSingle();
    if (!insertError) {
      return { lead: (inserted as UpsertLeadResult | null) ?? null, deduped: false };
    }
    // Race loser path: a sibling request inserted the same tenant + phone
    // between our SELECT and INSERT. Re-query the winner and upgrade it in
    // place instead of surfacing a duplicate-key error.
    if (isUniqueViolation(insertError)) {
      const winner = await findExistingLead(tenantId, [canonical, ...variants]);
      if (winner) {
        return applyLeadUpgrade(winner, cleanName, cleanIntent);
      }
    }
    throw insertError;
  }

  return applyLeadUpgrade(existing, cleanName, cleanIntent);
}

async function applyLeadUpgrade(
  existing: ExistingLead,
  cleanName: string | null,
  cleanIntent: string | null,
): Promise<UpsertLeadOutcome> {
  const updatePayload = buildLeadUpgrade(existing, cleanName, cleanIntent);
  if (!updatePayload) {
    return { lead: toOutcomeLead(existing), deduped: true };
  }
  const { data: updated, error: updateError } = await supabaseAdmin
    .from('tenant_appointments')
    .update(updatePayload)
    .eq('id', existing.id)
    .select(LEAD_SELECT)
    .maybeSingle();
  if (updateError) throw updateError;
  return { lead: (updated as UpsertLeadResult | null) ?? null, deduped: true };
}

