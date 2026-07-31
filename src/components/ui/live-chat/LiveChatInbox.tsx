'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  MessageSquare,
  Send,
  Minus,
  ChevronUp,
  RefreshCw,
  Volume2,
  VolumeX,
  Bot,
  User,
} from 'lucide-react';
import { formatMessageContent } from '@/utils/format-chat-message';
import type { ChatMessage, ConversationSummary, LiveChatInboxProps } from './types';

const STORAGE_KEY = 'ovg_livechat_expanded';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolveTenantIdentifier(identifier: string, supabase: ReturnType<typeof createClient>): Promise<string> {
  const trimmed = identifier.trim();
  if (!trimmed) return identifier;

  if (UUID_REGEX.test(trimmed)) {
    const { data } = await supabase
      .from('tenants')
      .select('id, tenant_id')
      .or(`id.eq.${trimmed},tenant_id.eq.${trimmed}`)
      .maybeSingle();

    if (data?.id) return data.id;
  } else {
    const { data } = await supabase
      .from('tenants')
      .select('id')
      .eq('tenant_id', trimmed)
      .maybeSingle();

    if (data?.id) return data.id;
  }

  return identifier;
}

function getRelativeTime(dateStr: string | null): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;
  return date.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

function getTimeLabel(dateStr: string | null): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function LiveChatInbox({ tenantId, accessToken }: LiveChatInboxProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [expanded, setExpanded] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return localStorage.getItem(STORAGE_KEY) !== 'false';
  });
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string>('');
  const [conversationsLoading, setConversationsLoading] = useState(false);
  const [muteState, setMuteState] = useState<{
    isAiMuted: boolean;
    isHumanTakingOver: boolean;
    scheduledReenableAt: string | null;
  } | null>(null);
  const [newConversationFlash, setNewConversationFlash] = useState<Set<string>>(new Set());

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>['channel']> | null>(null);
  const loadedRef = useRef(false);
  const optimisticIdsRef = useRef<Set<string>>(new Set());
  const flashTimeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const selectedRef = useRef(selectedConversationId);
  const isUnmountingRef = useRef(false);
  const isFetchingRef = useRef(false);

  const supabase = useMemo(() => createClient(), []);

  const hydratEd = useRef(false);
  const hydrateSession = useCallback(async () => {
    if (hydratEd.current) return;
    hydratEd.current = true;
    const token = accessToken;
    if (!token) {
        try {
          const raw = document.getElementById('session-bridge')?.textContent;
          if (raw) {
            const payload = JSON.parse(raw);
            if (payload?.access_token) {
              const sessionPayload: { access_token: string; refresh_token?: string } = { access_token: payload.access_token };
              if (payload.refresh_token) sessionPayload.refresh_token = payload.refresh_token;
              await supabase.auth.setSession(sessionPayload as never);
            }
          }
        } catch {
        // no-op
      }
      return;
    }
    try {
      await supabase.auth.setSession({ access_token: token } as never);
    } catch {
      // no-op
    }
  }, [accessToken, supabase]);

  const loadConversations = useCallback(async () => {
    if (!tenantId) return;
    if (document.hidden) return;
    if (isFetchingRef.current) return;

    try {
      isFetchingRef.current = true;
      setConversationsLoading(true);
      const res = await fetch(`/api/chat/conversations?tenantId=${encodeURIComponent(tenantId)}`);
      if (!res.ok) return;
      const data = await res.json();
      const list = (data.conversations ?? []) as ConversationSummary[];
      setConversations(list);
      setSelectedConversationId((prev) => {
        if (prev && list.some((c) => c.id === prev)) return prev;
        return list[0]?.id ?? '';
      });
    } catch {
      // non-fatal
    } finally {
      isFetchingRef.current = false;
      setConversationsLoading(false);
    }
  }, [tenantId]);

  const loadMessages = useCallback(async (convId: string) => {
    if (!tenantId) return;
    if (document.hidden) return;
    if (isFetchingRef.current) return;

    try {
      isFetchingRef.current = true;
      setLoadingMessages(true);
      setError(null);
      const { data: { user: _user } } = await supabase.auth.getUser();
      const token = accessToken || (await supabase.auth.getSession()).data.session?.access_token;
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`/api/widget/chat/messages?tenantId=${encodeURIComponent(tenantId)}&conversationId=${convId}`, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const msgs = (data.messages ?? []) as ChatMessage[];
      setMessages(msgs);
      if (data.muteState) {
        setMuteState(data.muteState);
      } else {
        setMuteState({ isAiMuted: false, isHumanTakingOver: false, scheduledReenableAt: null });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load messages');
    } finally {
      isFetchingRef.current = false;
      setLoadingMessages(false);
    }
  }, [tenantId, accessToken, supabase]);

  const markAsRead = useCallback(async (convId: string) => {
    if (!tenantId) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const token = accessToken || (await supabase.auth.getSession()).data.session?.access_token;
    const headers: Record<string, string> = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
    await fetch(`/api/chat/conversations/read`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ tenantId, conversationId: convId }),
    });
  }, [tenantId, accessToken, supabase]);

  const handleSelectConversation = useCallback((convId: string) => {
    setSelectedConversationId(convId);

    const existing = flashTimeoutsRef.current.get(convId);
    if (existing) {
      clearTimeout(existing);
      flashTimeoutsRef.current.delete(convId);
    }
    setNewConversationFlash((prev) => {
      const next = new Set(prev);
      next.delete(convId);
      return next;
    });

    loadMessages(convId);
    markAsRead(convId);
  }, [loadMessages, markAsRead]);

  const handleSend = useCallback(async () => {
    const content = input.trim();
    if (!content || !tenantId || sending) return;

    setInput('');
    setSending(true);
    setError(null);

    const targetConversationId = selectedConversationId;
    if (!targetConversationId) {
      setError('Select a conversation first');
      setSending(false);
      return;
    }

    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const optimisticMessage: ChatMessage = {
      id: tempId,
      tenant_id: tenantId,
      sender_id: currentUserId ?? 'unknown',
      message: content,
      role: 'agent',
      created_at: new Date().toISOString(),
      conversation_id: targetConversationId,
    };

    optimisticIdsRef.current.add(tempId);
    setMessages((prev) => [...prev, optimisticMessage]);

    try {
      const { data: { user: _user } } = await supabase.auth.getUser();
      const token = accessToken || (await supabase.auth.getSession()).data.session?.access_token;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const response = await fetch('/api/chat/send', {
        method: 'POST',
        headers,
        body: JSON.stringify({ tenantId, message: content, conversationId: targetConversationId }),
      });

      const result = await response.json();
      if (!response.ok) {
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        optimisticIdsRef.current.delete(tempId);
        throw new Error(result.error || 'Failed to send message');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message');
    } finally {
      setSending(false);
    }
  }, [input, tenantId, sending, selectedConversationId, currentUserId, accessToken, supabase]);

  const handleMuteToggle = useCallback(async () => {
    if (!selectedConversationId || !tenantId) return;
    const shouldMute = !muteState?.isAiMuted;
      const { data: { user: _user } } = await supabase.auth.getUser();
      const token = accessToken || (await supabase.auth.getSession()).data.session?.access_token;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      await fetch('/api/chat/mute', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        tenantId,
        conversationId: selectedConversationId,
        action: shouldMute ? 'mute' : 'resume',
        minutes: 30,
      }),
    });

    await loadMessages(selectedConversationId);
  }, [selectedConversationId, tenantId, muteState, accessToken, supabase, loadMessages]);

  // Minimal deps; cleanup is guarded by loadedRef to avoid re-subscribing.
  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    if (!tenantId || loadedRef.current) return;
    loadedRef.current = true;
    isUnmountingRef.current = false;

    const RECONNECT_MAX_ATTEMPTS = 5;
    const RECONNECT_BASE_DELAY = 1000;
    const RECONNECT_MAX_DELAY = 30000;

    const reconnectAttemptRef = { current: 0 };
    const reconnectTimerRef = { current: null as ReturnType<typeof setTimeout> | null };
    const isReconnectingRef = { current: false };

    const attemptReconnect = () => {
      if (reconnectAttemptRef.current >= RECONNECT_MAX_ATTEMPTS) {
        isReconnectingRef.current = false;
        console.warn('[LiveChat] reconnect exhausted');
        return;
      }
      isReconnectingRef.current = true;
      const attempt = reconnectAttemptRef.current;
      const delay = Math.min(RECONNECT_BASE_DELAY * 2 ** attempt, RECONNECT_MAX_DELAY);
      console.info(`[LiveChat] reconnect attempt ${attempt + 1} in ${delay}ms`);
      reconnectTimerRef.current = setTimeout(async () => {
        reconnectAttemptRef.current += 1;
        try {
          await subscribeToChatMessages();
          isReconnectingRef.current = false;
        } catch {
          isReconnectingRef.current = false;
        }
      }, delay);
    };

    const subscribeToChatMessages = async (): Promise<void> => {
      await loadConversations();

      const resolvedTenantId = await resolveTenantIdentifier(tenantId, supabase);
      const channelName = `chat_messages:${resolvedTenantId}:${Math.random().toString(36).slice(2, 9)}`;
      if (channelRef.current) {
        try {
          await supabase.removeChannel(channelRef.current);
        } catch {
          // best-effort cleanup
        }
        channelRef.current = null;
      }

      const channel = supabase.channel(channelName);
      channel.on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'chat_messages',
            filter: `tenant_id=eq.${resolvedTenantId}`,
          },
          (payload) => {
            const row = payload.new as ChatMessage;
            setMessages((prev) => {
              // Exact ID collision guard
              if (prev.some((m) => m.id === row.id)) return prev;

              // Replace optimistic temp message if server echoed it back
              const optimisticIndex = prev.findIndex(
                (m) =>
                  optimisticIdsRef.current.has(m.id) &&
                  m.sender_id === row.sender_id &&
                  m.message === row.message &&
                  m.tenant_id === row.tenant_id,
              );
              if (optimisticIndex !== -1) {
                const next = [...prev];
                next[optimisticIndex] = row;
                optimisticIdsRef.current.delete(prev[optimisticIndex].id);
                return next;
              }

              // Secondary collision guard: same sender, same content, within 2s
              const isDuplicate = prev.some(
                (m) =>
                  m.sender_id === row.sender_id &&
                  m.message === row.message &&
                  Math.abs(new Date(m.created_at).getTime() - new Date(row.created_at).getTime()) < 2000,
              );
              if (isDuplicate) return prev;

              return [...prev, row];
            });

            if (row.conversation_id) {
              const convId = row.conversation_id;
              setConversations((prev) => {
                const exists = prev.some((c) => c.id === convId);
                const updatedList = exists
                  ? prev.map((c) =>
                      c.id === convId
                        ? {
                            ...c,
                            label: row.role === 'visitor'
                              ? `${row.message.replace(/\n/g, ' ').slice(0, 28)} since ${getTimeLabel(row.created_at)}`
                              : c.label,
                            lastMessageAt: row.created_at,
                          }
                        : c,
                    )
                  : [
                      ...prev,
                      {
                        id: convId,
                        label: `${row.message.replace(/\n/g, ' ').slice(0, 28)} since ${getTimeLabel(row.created_at)}`,
                        lastMessageAt: row.created_at,
                        messageCount: 1,
                        lastReadAt: null,
                        hasUnread: true,
                      } as ConversationSummary,
                    ];
                updatedList.sort((a, b) => {
                  const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
                  const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
                  return bTime - aTime;
                });

                 if (convId !== selectedRef.current) {
                  setNewConversationFlash((prevFlash) => {
                    const next = new Set(prevFlash);
                    next.add(convId);
                    return next;
                  });
                  const existing = flashTimeoutsRef.current.get(convId);
                  if (existing) clearTimeout(existing);
                  flashTimeoutsRef.current.set(
                    convId,
                    setTimeout(() => {
                      setNewConversationFlash((prev) => {
                        const next = new Set(prev);
                        next.delete(convId);
                        return next;
                      });
                      flashTimeoutsRef.current.delete(convId);
                    }, 4000),
                  );
                }

                return updatedList;
              });
            }
          },
        );
      channel.subscribe((status, err) => {
          if (status === 'SUBSCRIBED') {
            reconnectAttemptRef.current = 0;
            console.info(`[LiveChat] subscription active: ${channelName}`);
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.error('[LiveChat] subscription error:', status, err);
            if (!isReconnectingRef.current && !isUnmountingRef.current) {
              attemptReconnect();
            }
          } else if (status === 'CLOSED') {
            console.warn('[LiveChat] subscription closed:', channelName);
            if (!isReconnectingRef.current && !isUnmountingRef.current) {
              attemptReconnect();
            }
          }
        });

      channelRef.current = channel;

      if (conversations.length > 0 && !selectedConversationId) {
        const first = conversations[0].id;
        setSelectedConversationId(first);
        loadMessages(first);
      }
    };

    const init = async () => {
      await hydrateSession();
      const { data: { user: _user } } = await supabase.auth.getUser();
      if (_user) {
        setCurrentUserId(_user.id);
      }

      await subscribeToChatMessages();
    };

    init();

    return () => {
      loadedRef.current = false;
      isUnmountingRef.current = true;
      isReconnectingRef.current = false;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (channelRef.current) {
        try { channelRef.current.unsubscribe(); } catch {}
        try { supabase.removeChannel(channelRef.current); } catch {}
        channelRef.current = null;
      }
    };
  }, [tenantId, accessToken, supabase]);

  useEffect(() => {
    selectedRef.current = selectedConversationId;
  }, [selectedConversationId]);

  // Auto-select the first conversation when the list loads and nothing is selected.
  useEffect(() => {
    if (!conversations.length || selectedConversationId) return;
    const first = conversations[0].id;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedConversationId(first);
    loadMessages(first);
  }, [conversations, selectedConversationId, loadMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpanded((prev) => !prev);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!tenantId) return null;

  const selected = conversations.find((c) => c.id === selectedConversationId);

  return (
    <div className="fixed bottom-6 right-6 z-40 w-[860px] max-w-[calc(100vw-3rem)] font-agrandir transition-all duration-300 ease-out">
      <div className="overflow-hidden rounded-2xl border border-white/15 bg-[#0a0f1d]/75 backdrop-blur-md shadow-2xl transition-all duration-300">
        <div className={`flex items-center justify-between px-4 py-3 bg-black/30 ${expanded ? 'border-b border-white/10' : ''}`}>
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-cyan-400" />
            <span className="text-xs font-semibold tracking-wide text-white">Live Chat Inbox</span>
            {conversations.length > 0 && (
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-zinc-300">
                {conversations.length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={loadConversations}
              aria-label="Refresh conversations"
              className="rounded-md p-1 text-zinc-400 transition-colors hover:bg-white/5 hover:text-cyan-300 focus:outline-none focus:ring-1 focus:ring-white/20"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setExpanded((prev) => {
                const next = !prev;
                localStorage.setItem(STORAGE_KEY, next ? 'true' : 'false');
                return next;
              })}
              aria-label={expanded ? 'Minimize chat' : 'Expand chat'}
              aria-expanded={expanded}
              className="rounded-md p-1 text-zinc-400 transition-colors hover:bg-white/5 hover:text-cyan-300 focus:outline-none focus:ring-1 focus:ring-white/20"
            >
              {expanded ? <Minus className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>

        {expanded && (
          <div className="flex">
            <div className="w-80 border-r border-white/10 flex-shrink-0">
              <div className="px-3 py-2 border-b border-white/5">
                <div className="text-[10px] font-semibold tracking-widest text-zinc-500 uppercase">Conversations</div>
              </div>
              <div className="h-[420px] overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                {conversationsLoading && conversations.length === 0 && (
                  <p className="p-3 text-center text-xs text-zinc-500">Loading…</p>
                )}
                {!conversationsLoading && conversations.length === 0 && (
                  <p className="p-3 text-center text-xs text-zinc-500">No conversations yet</p>
                )}
                {conversations.map((conv) => {
                  const isSelected = conv.id === selectedConversationId;
                  const isFlashing = newConversationFlash.has(conv.id);
                  return (
                    <button
                      key={conv.id}
                      type="button"
                      onClick={() => handleSelectConversation(conv.id)}
                      className={[
                        'w-full text-left px-3 py-2.5 border-b border-white/5 transition-colors',
                        isSelected ? 'bg-cyan-500/10' : 'hover:bg-white/5',
                        isFlashing ? 'animate-pulse ring-1 ring-cyan-400 ring-offset-1 ring-offset-[#0a0f1d]' : '',
                      ].join(' ')}
                    >
                      <div className="flex items-center justify-between gap-2 min-w-0">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="truncate min-w-0 text-xs text-white">{conv.label}</span>
                          </div>
                          <div className="mt-0.5 flex items-center gap-2 min-w-0">
                            <span className="truncate min-w-0 shrink-0 whitespace-nowrap text-[10px] text-zinc-500">{getRelativeTime(conv.lastMessageAt)}</span>
                            {conv.muteState?.isAiMuted && (
                              <span className="shrink-0 whitespace-nowrap inline-flex items-center gap-1 rounded-full bg-orange-500/10 px-1.5 py-0.5 text-[10px] text-orange-300">
                                <Bot className="h-3 w-3" />
                                {conv.muteState.isHumanTakingOver ? 'Human handling' : 'AI paused'}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {conv.hasUnread && (
                            <span className="h-2 w-2 rounded-full bg-cyan-400" />
                          )}
                          <span className="text-[10px] text-zinc-500">{conv.messageCount}</span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex-1 min-w-0">
              {selected ? (
                <>
                  <div className="flex items-center justify-between px-4 py-2 border-b border-white/10">
                    <div className="flex items-center gap-2 min-w-0">
                      <User className="h-3.5 w-3.5 text-zinc-400 flex-shrink-0" />
                      <span className="truncate text-xs text-zinc-200 font-medium">{selected.label}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {muteState?.isAiMuted && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-orange-500/10 px-2 py-0.5 text-[10px] text-orange-300">
                          <VolumeX className="h-3 w-3" />
                          AI paused
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={handleMuteToggle}
                        className={[
                          'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] transition-colors',
                          muteState?.isAiMuted
                            ? 'bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
                            : 'bg-orange-500/10 text-orange-300 hover:bg-orange-500/20',
                        ].join(' ')}
                      >
                        {muteState?.isAiMuted ? (
                          <>
                            <Volume2 className="h-3 w-3" />
                            Resume AI
                          </>
                        ) : (
                          <>
                            <VolumeX className="h-3 w-3" />
                            Mute AI
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                  <div className="h-72 overflow-y-auto px-4 py-3 space-y-2 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                    {loadingMessages && (
                      <p className="text-center text-xs text-zinc-500">Loading messages…</p>
                    )}
                    {!loadingMessages && error && (
                      <p className="text-center text-xs text-red-400">{error}</p>
                    )}
                    {!loadingMessages && !error && messages.length === 0 && (
                      <p className="text-center text-xs text-zinc-500">No messages yet</p>
                    )}
                    {messages.map((msg) => (
                      <div
                        key={msg.id}
                        className={[
                          'rounded-2xl border px-4 py-2.5 text-xs leading-relaxed transition-colors duration-200',
                          msg.sender_id === currentUserId
                            ? 'bg-blue-600/30 border-blue-400/30 text-white rounded-tr-xs ml-auto'
                            : 'bg-white/5 border-white/10 text-slate-100 rounded-tl-xs',
                        ].join(' ')}
                      >
                        <p className="whitespace-pre-wrap break-words">{formatMessageContent(msg.message)}</p>
                        <span className="mt-1 block text-[10px] text-zinc-500">
                          {getTimeLabel(msg.created_at)}
                        </span>
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                  <div className="flex items-center gap-2 bg-slate-900/50 border border-white/10 focus-within:border-cyan-500/50 rounded-xl px-3 py-3">
                    <input
                      type="text"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSend();
                        }
                      }}
                      placeholder="Type a message…"
                      className="flex-1 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-xs text-white placeholder:text-zinc-500 outline-none transition-colors focus:border-cyan-500/60 focus:ring-2 focus:ring-cyan-500/20"
                    />
                    <button
                      type="button"
                      onClick={handleSend}
                      disabled={sending || !input.trim()}
                      aria-label="Send message"
                      className="rounded-lg bg-cyan-500/90 p-2 text-white transition-colors hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:ring-offset-2 focus:ring-offset-black/40"
                    >
                      <Send className="h-4 w-4" />
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex h-72 items-center justify-center text-xs text-zinc-500">
                  Select a conversation to view messages
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
