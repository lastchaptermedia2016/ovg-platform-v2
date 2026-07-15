'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Radio, Pause, Play, Activity, MessageSquare, Zap } from 'lucide-react';
import {
  mergeFeedEntries,
  formatFeedTimestamp,
  type ActionLogRow,
  type ChatMessageRow,
  type FeedEntry,
} from '@/lib/telemetry/feed';
import type { FeatureScope } from '@/lib/audit/command-types';

interface LiveTelemetryFeedProps {
  /** UUID tenant id whose audit log + chat history to stream. */
  tenantId: string;
  /** Optional human label for the header. */
  clientName?: string;
  /** Polling cadence in ms (high-frequency by default). */
  pollIntervalMs?: number;
  /** Max rows to keep in the rendered window. */
  limit?: number;
}

const DEFAULT_POLL_MS = 3000;
const DEFAULT_LIMIT = 100;

/**
 * Admin live telemetry feed. High-frequency polls `action_logs` and
 * `chat_messages` for the selected client `tenant_id` and renders a single
 * chronologically sorted, scannable stream. Surface-scope badges distinguish
 * the client vs. reseller origin of every entry.
 */
export default function LiveTelemetryFeed({
  tenantId,
  clientName,
  pollIntervalMs = DEFAULT_POLL_MS,
  limit = DEFAULT_LIMIT,
}: LiveTelemetryFeedProps) {
  const [entries, setEntries] = useState<FeedEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLive, setIsLive] = useState(true);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const isLiveRef = useRef(isLive);

  useEffect(() => {
    isLiveRef.current = isLive;
  }, [isLive]);

  const poll = useCallback(async () => {
    if (!tenantId) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    setError(null);

    try {
      const supabase = createClient();
      const [actionsResult, chatResult] = await Promise.all([
        supabase
          .from('action_logs')
          .select('action_id, tenant_id, user_id, source, params, result, created_at, success')
          .eq('tenant_id', tenantId)
          .order('created_at', { ascending: false })
          .limit(limit),
        supabase
          .from('chat_messages')
          .select('id, tenant_id, sender_id, content, created_at')
          .eq('tenant_id', tenantId)
          .order('created_at', { ascending: false })
          .limit(limit),
      ]);

      if (controller.signal.aborted) return;

      if (actionsResult.error) throw actionsResult.error;
      if (chatResult.error) throw chatResult.error;

      const actionLogs = (actionsResult.data ?? []) as ActionLogRow[];
      const chatMessages = (chatResult.data ?? []) as ChatMessageRow[];

      const merged = mergeFeedEntries(actionLogs, chatMessages, limit);
      setEntries(merged);
      setLastSyncedAt(new Date());
    } catch (err) {
      if (controller.signal.aborted) return;
      console.error('[LiveTelemetryFeed] poll failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to load telemetry');
    } finally {
      if (!controller.signal.aborted) setIsLoading(false);
    }
  }, [tenantId, limit]);

  useEffect(() => {
    if (!tenantId) return;

    const intervalId = setInterval(() => {
      if (isLiveRef.current) void poll();
    }, pollIntervalMs);
    const initialPollId = setTimeout(() => void poll(), 0);

    return () => {
      clearInterval(intervalId);
      clearTimeout(initialPollId);
      abortRef.current?.abort();
      setEntries([]);
      setLastSyncedAt(null);
    };
  }, [tenantId, pollIntervalMs, poll]);

  if (!tenantId) {
    return (
      <div className="w-full rounded-2xl border border-white/10 bg-slate-950/15 backdrop-blur-md p-5 md:p-6 text-xs text-zinc-400 font-agrandir">
        Select a client to view live telemetry.
      </div>
    );
  }

  const actionCount = entries.filter((e) => e.kind === 'action').length;
  const chatCount = entries.filter((e) => e.kind === 'conversation').length;

  return (
    <div className="w-full rounded-2xl border border-white/10 bg-slate-950/15 backdrop-blur-md overflow-hidden flex flex-col max-h-[640px]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 md:px-5 py-3 border-b border-white/10">
        <div className="flex items-center gap-2">
          <span
            className={`relative flex h-2.5 w-2.5 ${isLive ? '' : 'opacity-40'}`}
            aria-hidden="true"
          >
            {isLive && (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            )}
            <span
              className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                isLive ? 'bg-emerald-400' : 'bg-zinc-500'
              }`}
            />
          </span>
          <h3 className="text-sm font-bold text-white font-agrandir flex items-center gap-1.5">
            <Radio className="w-4 h-4 text-emerald-400" />
            Live Telemetry
          </h3>
          {clientName && (
            <span className="text-[11px] text-white/50 truncate max-w-[160px]">
              · {clientName}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <span className="text-[10px] text-white/40 hidden sm:inline">
            {actionCount} actions · {chatCount} msgs
            {lastSyncedAt ? ` · ${lastSyncedAt.toLocaleTimeString()}` : ''}
          </span>
          <button
            type="button"
            onClick={() => setIsLive((v) => !v)}
            aria-pressed={isLive}
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${
              isLive
                ? 'bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25'
                : 'bg-white/10 text-white/60 hover:bg-white/20'
            }`}
          >
            {isLive ? (
              <>
                <Pause className="w-3 h-3" /> Pause
              </>
            ) : (
              <>
                <Play className="w-3 h-3" /> Resume
              </>
            )}
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto custom-scrollbar px-2 py-2">
        {error && (
          <div className="m-2 rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-xs text-red-400 font-agrandir">
            {error}
          </div>
        )}

        {!error && isLoading && entries.length === 0 && (
          <div className="p-4 text-xs text-zinc-400 font-agrandir">Loading telemetry…</div>
        )}

        {!error && !isLoading && entries.length === 0 && (
          <div className="p-4 text-xs text-zinc-400 font-agrandir">
            No activity captured for this client yet.
          </div>
        )}

        <ul className="space-y-1.5">
          {entries.map((entry) => (
            <TelemetryRow key={entry.id} entry={entry} />
          ))}
        </ul>
      </div>
    </div>
  );
}

function TelemetryRow({ entry }: { entry: FeedEntry }) {
  return (
    <li className="flex items-start gap-3 rounded-lg border border-white/5 bg-white/[0.03] hover:bg-white/[0.06] px-3 py-2 transition-colors">
      <div className="mt-0.5 shrink-0">
        {entry.kind === 'action' ? (
          <Zap className="w-4 h-4 text-amber-300" />
        ) : (
          <MessageSquare className="w-4 h-4 text-sky-300" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          {entry.kind === 'action' ? (
            <span className="text-[11px] font-mono font-semibold text-amber-200/90">
              {entry.actionType}
            </span>
          ) : (
            <span className="text-[11px] font-mono font-semibold text-sky-200/90">
              CONVERSATION
            </span>
          )}

          <ScopeBadge scope={entry.scope} />

          {entry.kind === 'action' && typeof entry.success === 'boolean' && (
            <span
              className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                entry.success
                  ? 'bg-emerald-500/15 text-emerald-300'
                  : 'bg-red-500/15 text-red-300'
              }`}
            >
              {entry.success ? 'ok' : 'fail'}
            </span>
          )}

          <span className="ml-auto text-[10px] text-white/40 whitespace-nowrap">
            {formatFeedTimestamp(entry.createdAt)}
          </span>
        </div>

        {entry.kind === 'conversation' && entry.conversation && (
          <div className="mt-1 text-[11px] leading-relaxed text-white/70 space-y-0.5">
            {entry.conversation.user && (
              <p className="truncate">
                <span className="text-emerald-300/80 font-medium">User:</span>{' '}
                &ldquo;{entry.conversation.user}&rdquo;
              </p>
            )}
            {entry.conversation.ai && (
              <p className="truncate">
                <span className="text-sky-300/80 font-medium">AI:</span>{' '}
                &ldquo;{entry.conversation.ai}&rdquo;
              </p>
            )}
          </div>
        )}

        {entry.kind === 'action' && (
          <p className="mt-0.5 text-[10px] text-white/40 flex items-center gap-1">
            <Activity className="w-3 h-3" />
            {entry.scope === 'client' ? 'Client surface dispatch' : 'Reseller admin dispatch'}
          </p>
        )}
      </div>
    </li>
  );
}

function ScopeBadge({ scope }: { scope: FeatureScope }) {
  const isClient = scope === 'client';
  const isInfra = scope === 'infrastructure';
  return (
    <span
      className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${
        isClient
          ? 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30'
          : isInfra
            ? 'bg-slate-500/10 text-slate-300 border-slate-500/30'
            : 'bg-fuchsia-500/10 text-fuchsia-300 border-fuchsia-500/30'
      }`}
    >
      {isClient ? 'Client' : isInfra ? 'Infra' : 'Reseller'}
    </span>
  );
}
