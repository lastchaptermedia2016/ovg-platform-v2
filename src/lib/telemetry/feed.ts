/**
 * Live Telemetry Feed — data normalization helpers.
 *
 * Pure, framework-free functions that merge the two audit sources
 * (`action_logs` for dispatched agent actions and `chat_messages` for the
 * conversational history) into a single, chronologically sorted feed.
 *
 * Keeping this logic pure (no Supabase / React imports) makes it trivially
 * unit-testable and lets both the polling hook and the server share one
 * canonical transform.
 *
 * @module telemetry/feed
 */

import type { FeatureScope } from '@/lib/audit/command-types';
import { FEATURE_REGISTRY } from '@/lib/audit/feature-registry';
import type { SYSTEM_COMMAND } from '@/lib/audit/command-types';

/** Raw row shape from the `action_logs` table (selected columns). */
export interface ActionLogRow {
  action_id: string;
  tenant_id: string;
  user_id?: string | null;
  source?: string | null;
  params?: Record<string, unknown> | null;
  result?: Record<string, unknown> | null;
  created_at: string;
  success?: boolean | null;
}

/** Raw row shape from the `chat_messages` table (selected columns). */
export interface ChatMessageRow {
  id: string;
  tenant_id: string;
  sender_id?: string | null;
  content: string;
  created_at: string;
}

/** A single, normalized entry rendered in the live feed. */
export interface FeedEntry {
  id: string;
  /** ISO timestamp — sort key. */
  createdAt: string;
  /** Display kind drives the row's accent + icon. */
  kind: 'action' | 'conversation';
  /** Human-readable action type, e.g. "SYSTEM_UPDATE_BRANDING". */
  actionType?: string;
  /** Originating surface: `client` or `reseller`. */
  scope: FeatureScope;
  /** True when the underlying action succeeded (actions only). */
  success?: boolean | null;
  /** Parsed conversational pair for chat rows. */
  conversation?: {
    user: string;
    ai: string;
    surface?: string;
  };
}

/**
 * Determine the surface scope badge for an action log.
 *
 * Prefers the explicit `surface` tag written into `params` by
 * `logPlatformAction`, then falls back to the `source` column, and finally
 * the `FEATURE_REGISTRY` lookup by action id. Resolves everything down to the
 * binary `client` / `reseller` the UI renders.
 */
export function deriveActionScope(row: ActionLogRow): FeatureScope {
  const params = row.params as Record<string, unknown> | undefined;
  const surface = params?.surface;
  if (surface === 'reseller') return 'reseller';
  if (surface === 'client' || surface === 'infrastructure') return 'client';

  const source = row.source;
  if (source === 'reseller') return 'reseller';
  if (source === 'client' || source === 'infrastructure') return 'client';

  const registry = FEATURE_REGISTRY[row.action_id as SYSTEM_COMMAND];
  if (registry?.scope === 'reseller') return 'reseller';
  return 'client';
}

/** Normalize a raw `action_logs` row into a feed entry. */
export function normalizeActionLog(row: ActionLogRow): FeedEntry {
  return {
    id: `action:${row.created_at}:${row.action_id}`,
    createdAt: row.created_at,
    kind: 'action',
    actionType: row.action_id,
    scope: deriveActionScope(row),
    success: row.success,
  };
}

/** Parse the JSON-encoded `chat_messages.content` into a User/AI pair. */
export function parseChatContent(content: string): {
  user: string;
  ai: string;
  surface?: string;
} {
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    const assistant = parsed.assistant as Record<string, unknown> | undefined;
    return {
      user: typeof parsed.user === 'string' ? parsed.user : '',
      ai:
        typeof assistant?.summary === 'string'
          ? assistant.summary
          : typeof parsed.assistant === 'string'
            ? parsed.assistant
            : '',
      surface: typeof assistant?.surface === 'string' ? assistant.surface : undefined,
    };
  } catch {
    // Plain-text fallback: treat the whole blob as the user turn.
    return { user: content, ai: '' };
  }
}

/** Normalize a raw `chat_messages` row into a feed entry. */
export function normalizeChatMessage(row: ChatMessageRow): FeedEntry {
  const conversation = parseChatContent(row.content);
  const scope: FeatureScope =
    conversation.surface === 'reseller' ? 'reseller' : 'client';
  return {
    id: `chat:${row.id}`,
    createdAt: row.created_at,
    kind: 'conversation',
    scope,
    conversation,
  };
}

/**
 * Merge action logs and chat messages into one feed sorted newest-first.
 * `limit` caps the rendered window to keep the DOM scannable.
 */
export function mergeFeedEntries(
  actionLogs: ActionLogRow[],
  chatMessages: ChatMessageRow[],
  limit = 100,
): FeedEntry[] {
  const entries: FeedEntry[] = [
    ...actionLogs.map(normalizeActionLog),
    ...chatMessages.map(normalizeChatMessage),
  ];

  entries.sort((a, b) => {
    const diff = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    if (diff !== 0) return diff;
    return a.id.localeCompare(b.id);
  });

  return limit > 0 ? entries.slice(0, limit) : entries;
}

/** Format an ISO timestamp into a compact, scannable clock + relative label. */
export function formatFeedTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const time = date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const diffMs = Date.now() - date.getTime();
  const seconds = Math.round(diffMs / 1000);
  if (seconds < 5) return `${time} · now`;
  if (seconds < 60) return `${time} · ${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${time} · ${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${time} · ${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${time} · ${days}d ago`;
}
