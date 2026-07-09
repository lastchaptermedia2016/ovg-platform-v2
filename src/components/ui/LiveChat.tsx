'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { MessageSquare, Send, Minus, ChevronUp } from 'lucide-react';

interface ChatMessage {
  id: string;
  tenant_id: string;
  sender_id: string;
  content: string;
  created_at: string;
}

interface LiveChatProps {
  tenantId: string;
}

const STORAGE_KEY = 'ovg_livechat_expanded';

export function LiveChat({ tenantId }: LiveChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [expanded, setExpanded] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return localStorage.getItem(STORAGE_KEY) !== 'false';
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>['channel']> | null>(null);
  const loadedRef = useRef(false);

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
        const { data, error: queryError } = await supabase
          .from('chat_messages')
          .select('*')
          .eq('tenant_id', tenantId)
          .order('created_at', { ascending: true });
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

    loadMessages();

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
          setMessages((prev) =>
            prev.some((m) => m.id === row.id) ? prev : [...prev, row],
          );
        },
      )
      .subscribe();
    channelRef.current = channel;

    return () => {
      active = false;
      loadedRef.current = false;
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [tenantId]);

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

    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    const senderId = userData.user?.id;
    if (!senderId) {
      setError('You must be signed in to send messages.');
      return;
    }

    setInput('');
    setSending(true);
    setError(null);
    try {
      const { error: insertError } = await supabase
        .from('chat_messages')
        .insert({ tenant_id: tenantId, sender_id: senderId, content });
      if (insertError) throw insertError;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  if (!tenantId) return null;

  return (
    <div className="fixed bottom-6 right-6 z-40 w-80 max-w-[calc(100vw-3rem)] font-agrandir">
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/40 backdrop-blur-md shadow-2xl shadow-black/40">
        {/* Header (stable across expand/collapse — no layout shift) */}
        <div className={`flex items-center justify-between px-4 py-3 bg-black/30 ${expanded ? 'border-b border-white/10' : ''}`}>
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-cyan-400" />
            <span className="text-xs font-semibold tracking-wide text-white">
              Live Chat
            </span>
          </div>
          <button
            type="button"
            onClick={toggleExpanded}
            aria-label={expanded ? 'Minimize chat' : 'Expand chat'}
            aria-expanded={expanded}
            className="rounded-md p-1 text-zinc-400 transition-colors hover:bg-white/5 hover:text-cyan-300"
          >
            {expanded ? <Minus className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </button>
        </div>

        {/* Body */}
        {expanded && (
          <>
            <div className="h-80 overflow-y-auto px-4 py-3 space-y-2">
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
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs leading-relaxed text-zinc-200"
                >
                  <p className="whitespace-pre-wrap break-words">{msg.content}</p>
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

            <div className="flex items-center gap-2 border-t border-white/10 px-3 py-3">
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
                className="flex-1 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-xs text-white placeholder:text-zinc-500 outline-none transition-colors focus:border-cyan-500/40"
              />
              <button
                type="button"
                onClick={handleSend}
                disabled={sending || !input.trim()}
                aria-label="Send message"
                className="rounded-lg bg-cyan-500/90 p-2 text-white transition-colors hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-40"
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
