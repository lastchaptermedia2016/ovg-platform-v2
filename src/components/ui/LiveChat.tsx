'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { MessageSquare, Send, Minus, ChevronUp, RefreshCw } from 'lucide-react';
import { formatMessageContent } from '@/utils/format-chat-message';

interface ChatMessage {
  id: string;
  tenant_id: string;
  sender_id: string;
  message: string;
  created_at: string;
  role: string;
  conversation_id?: string;
}

interface ConversationOption {
  id: string;
  label: string;
  lastMessageAt: string | null;
  messageCount: number;
}

interface LiveChatProps {
  tenantId: string;
  accessToken?: string | null;
  conversationId?: string;
}

const STORAGE_KEY = 'ovg_livechat_expanded';

export function LiveChat({ tenantId, accessToken, conversationId }: LiveChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [expanded, setExpanded] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return localStorage.getItem(STORAGE_KEY) !== 'false';
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationOption[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string>('');
  const [conversationsLoading, setConversationsLoading] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>['channel']> | null>(null);
  const loadedRef = useRef(false);
  const optimisticIdsRef = useRef<Set<string>>(new Set());

  const loadConversations = useCallback(async () => {
    if (!tenantId) return;
    setConversationsLoading(true);
    try {
      const res = await fetch(`/api/chat/conversations?tenantId=${encodeURIComponent(tenantId)}`);
      if (!res.ok) return;
      const data = await res.json();
      const list = (data.conversations ?? []) as ConversationOption[];
      setConversations(list);
      setSelectedConversationId((prev) => {
        if (prev && list.some((c) => c.id === prev)) return prev;
        return list[0]?.id ?? '';
      });
    } catch {
      /* non-fatal */
    } finally {
      setConversationsLoading(false);
    }
  }, [tenantId]);

  // Fetch history + subscribe to realtime inserts for this tenant.
  useEffect(() => {
    if (!tenantId || loadedRef.current) return;
    loadedRef.current = true;

    const supabase = createClient();
    let active = true;

    const loadMessages = async () => {
      setLoading(true);
      setError(null);
      try {
        let query = supabase
          .from('chat_messages')
          .select('*')
          .eq('tenant_id', tenantId)
          .order('created_at', { ascending: true });
        if (selectedConversationId) {
          query = query.eq('conversation_id', selectedConversationId);
        }
        const { data, error: queryError } = await query;
        if (!active) return;
        if (queryError) throw queryError;
        setMessages((data as ChatMessage[]) ?? []);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Failed to load messages');
      } finally {
        if (active) setLoading(false);
      }
    };

    const hydrateSession = async (client: ReturnType<typeof createClient>) => {
      const token = accessToken;
      if (!token) {
        try {
          const raw = document.getElementById('session-bridge')?.textContent;
          if (!raw) return;
          const payload = JSON.parse(raw);
          if (payload?.access_token) {
            const sessionPayload: { access_token: string; refresh_token?: string } = {
              access_token: payload.access_token,
            };
            if (payload.refresh_token) {
              sessionPayload.refresh_token = payload.refresh_token;
            }
            await client.auth.setSession(sessionPayload as { access_token: string; refresh_token: string });
          }
        } catch {
          // no-op
        }
        return;
      }

      try {
        await client.auth.setSession({
          access_token: token,
        } as { access_token: string; refresh_token: string });
      } catch {
        // no-op
      }
    };

    const init = async () => {
      await hydrateSession(supabase);
      if (!active) return;

      const { data: { user } } = await supabase.auth.getUser();
      if (active && user) {
        setCurrentUserId(user.id);
      }

      await loadMessages();
      await loadConversations();
      if (!active) return;

      const channel = supabase
        .channel(`chat_messages:${tenantId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'chat_messages',
            filter: `tenant_id=eq.${tenantId}`,
          },
          (payload) => {
            const row = payload.new as ChatMessage;
            setMessages((prev) => {
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

              if (prev.some((m) => m.id === row.id)) return prev;
              return [...prev, row];
            });

            if (row.conversation_id) {
              const convId = row.conversation_id;
              setConversations((prev) => {
                const exists = prev.some((c) => c.id === convId);
                if (exists) {
                  setSelectedConversationId((current) => {
                    if (!current) return convId;
                    return current;
                  });
                  return prev.map((c) =>
                    c.id === convId
                      ? {
                          ...c,
                          label: row.role === 'visitor'
                            ? `${row.message.replace(/\n/g, ' ').slice(0, 28)} since ${new Date(row.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                            : c.label,
                          lastMessageAt: row.created_at,
                        }
                      : c,
                  ).sort((a, b) => {
                    const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
                    const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
                    return bTime - aTime;
                  });
                }
                const newConv: ConversationOption = {
                  id: convId,
                  label: `${row.message.replace(/\n/g, ' ').slice(0, 28)} since ${new Date(row.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
                  lastMessageAt: row.created_at,
                  messageCount: 1,
                };
                const next = [...prev, newConv].sort((a, b) => {
                  const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
                  const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
                  return bTime - aTime;
                });
                setSelectedConversationId((current) => current || convId);
                return next;
              });
            }
          },
        )
        .subscribe((status, err) => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.error('[LiveChat] subscription error:', status, err);
          } else if (status === 'SUBSCRIBED') {
            console.info('[LiveChat] subscription active:', `chat_messages:${tenantId}`);
          } else if (status === 'CLOSED') {
            console.warn('[LiveChat] subscription closed:', `chat_messages:${tenantId}`);
          }
        });
      if (active) {
        channelRef.current = channel;
      } else {
        channel.unsubscribe();
        supabase.removeChannel(channel);
      }
    };

    init();

    return () => {
      active = false;
      loadedRef.current = false;
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [tenantId, accessToken, selectedConversationId, loadConversations]);

  // Auto-scroll to the newest message.
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const toggleExpanded = () => {
    setExpanded((prev) => {
      const next = !prev;
      localStorage.setItem(STORAGE_KEY, next ? 'true' : 'false');
      return next;
    });
  };

  const handleSend = async () => {
    const content = input.trim();
    if (!content || !tenantId || sending) return;

    setInput('');
    setSending(true);
    setError(null);

    const targetConversationId = selectedConversationId || conversationId;
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
    };

    optimisticIdsRef.current.add(tempId);
    setMessages((prev) => [...prev, optimisticMessage]);

    try {
      const response = await fetch('/api/chat/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
  };

  const handleRefreshConversations = async () => {
    await loadConversations();
  };

  if (!tenantId) return null;

  return (
    <div className="fixed bottom-6 right-6 z-40 w-80 max-w-[calc(100vw-3rem)] font-agrandir transition-all duration-300 ease-out">
      <div className="overflow-hidden rounded-2xl border border-white/15 bg-[#0a0f1d]/75 backdrop-blur-md shadow-2xl transition-all duration-300">
        {/* Header (stable across expand/collapse — no layout shift) */}
        <div className={`flex items-center justify-between px-4 py-3 bg-black/30 ${expanded ? 'border-b border-white/10' : ''}`}>
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-cyan-400" />
            <span className="text-xs font-semibold tracking-wide text-white">
              Live Chat
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleRefreshConversations}
              aria-label="Refresh conversations"
              className="rounded-md p-1 text-zinc-400 transition-colors hover:bg-white/5 hover:text-cyan-300 focus:outline-none focus:ring-1 focus:ring-white/20"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={toggleExpanded}
              aria-label={expanded ? 'Minimize chat' : 'Expand chat'}
              aria-expanded={expanded}
              className="rounded-md p-1 text-zinc-400 transition-colors hover:bg-white/5 hover:text-cyan-300 focus:outline-none focus:ring-1 focus:ring-white/20"
            >
              {expanded ? <Minus className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>

        {/* Conversation picker */}
        {expanded && (
          <div className="px-3 py-2 border-b border-white/5">
            <select
              value={selectedConversationId}
              onChange={(e) => setSelectedConversationId(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-white outline-none transition-colors focus:border-cyan-500/60 focus:ring-2 focus:ring-cyan-500/20"
            >
              {conversationsLoading && (
                <option value="">Loading conversations…</option>
              )}
              {!conversationsLoading && conversations.length === 0 && (
                <option value="">No conversations yet</option>
              )}
              {conversations.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label} ({c.messageCount})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Body */}
        {expanded && (
          <>
            <div className="h-80 overflow-y-auto px-4 py-3 space-y-2 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent transition-all duration-300">
              {loading && (
                <p className="text-center text-xs text-zinc-500">Loading messages…</p>
              )}
              {!loading && error && (
                <p className="text-center text-xs text-red-400">{error}</p>
              )}
              {!loading && !error && messages.length === 0 && (
                <p className="text-center text-xs text-zinc-500">
                  No messages yet. Start the conversation.
                </p>
              )}
               {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`rounded-2xl border px-4 py-2.5 text-xs leading-relaxed transition-colors duration-200 ${
                    msg.sender_id === currentUserId
                      ? 'bg-blue-600/30 border-blue-400/30 text-white rounded-tr-xs ml-auto'
                      : 'bg-white/5 border-white/10 text-slate-100 rounded-tl-xs hover:bg-white/10'
                  }`}
                >
                  <p className="whitespace-pre-wrap break-words">{formatMessageContent(msg.message)}</p>
                  <span className="mt-1 block text-[10px] text-zinc-500">
                    {new Date(msg.created_at).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
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
        )}
      </div>
    </div>
  );
}
