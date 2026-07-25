import { supabaseAdmin } from '@/lib/supabase/admin';
import { getTenantBySlug } from '@/core/tenant/db';
import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/auth/server';
import { normalizeVisitorPhone, normalizeVisitorEmail } from '@/lib/ai/memory-service';

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function getMessagePreview(message: string | undefined | null): string {
  if (!message) return '';
  let text = message;
  try {
    const parsed = JSON.parse(message);
    if (typeof parsed === 'object' && parsed !== null) {
      if (parsed.assistant?.summary) {
        text = parsed.assistant.summary;
      } else if (typeof parsed.user === 'string') {
        text = parsed.user;
      }
    }
  } catch {
    text = message;
  }
  return text.replace(/\n/g, ' ').slice(0, 28);
}

export async function GET(request: NextRequest) {
  try {
    const tenantId = request.nextUrl.searchParams.get('tenantId');
    if (!tenantId || typeof tenantId !== 'string') {
      return NextResponse.json({ error: 'Missing tenantId' }, { status: 400 });
    }

    const { user } = await getUserFromRequest(request);

    const tenant = await getTenantBySlug(tenantId, supabaseAdmin);
    if (!tenant) {
      return NextResponse.json({ error: 'Unknown tenant' }, { status: 404 });
    }

    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

    const { data: conversations, error: convError } = await supabaseAdmin
      .from('chat_messages')
      .select('conversation_id, created_at, message, role, sender_id')
      .eq('tenant_id', tenant.id)
      .not('conversation_id', 'is', null)
      .gte('created_at', cutoff)
      .order('created_at', { ascending: true });

    if (convError) {
      console.error('[API_CHAT_CONVERSATIONS_ERROR]:', convError);
      return NextResponse.json({ error: 'Failed to load conversations' }, { status: 500 });
    }

    const convMap = new Map<string, {
      id: string;
      messages: Array<{ created_at: string; message: string; role: string; sender_id: string | null }>;
    }>();

    for (const row of conversations ?? []) {
      if (!isUuid(row.conversation_id)) continue;
      const current = convMap.get(row.conversation_id);
      const target = current ?? { id: row.conversation_id, messages: [] as Array<{ created_at: string; message: string; role: string; sender_id: string | null }> };
      target.messages.push({
        created_at: row.created_at,
        message: row.message,
        role: row.role,
        sender_id: row.sender_id,
      });
      convMap.set(row.conversation_id, target);
    }

    const readStateMap = new Map<string, string>();
    if (user) {
      const convIds = Array.from(convMap.keys()).map((id) => `"${id}"`);
      if (convIds.length > 0) {
        const { data: readStates } = await supabaseAdmin
          .from('conversation_read_state')
          .select('conversation_id, last_read_at')
          .eq('user_id', user.id)
          .in('conversation_id', convIds);

        for (const rs of readStates ?? []) {
          readStateMap.set(rs.conversation_id, rs.last_read_at);
        }
      }
    }

    const { data: memories } = await supabaseAdmin
      .from('visitor_memories')
      .select('memory_key, memory_value, updated_at')
      .eq('tenant_id', tenant.id)
      .eq('memory_key', 'client_name')
      .order('updated_at', { ascending: false });

    const identityToMemoryName = new Map<string, string>();
    const { data: allMemoryRows } = await supabaseAdmin
      .from('visitor_memories')
      .select('identity_type, identity_value, memory_value')
      .eq('tenant_id', tenant.id)
      .eq('memory_key', 'client_name')
      .order('updated_at', { ascending: false });

    for (const mem of allMemoryRows ?? []) {
      const key = `${mem.identity_type}:${mem.identity_value}`;
      if (!identityToMemoryName.has(key)) {
        identityToMemoryName.set(key, mem.memory_value);
      }
    }

    const { data: appointments } = await supabaseAdmin
      .from('tenant_appointments')
      .select('client_name, client_phone, start_time')
      .eq('tenant_id', tenant.id)
      .order('start_time', { ascending: false });

    const phoneToApptName = new Map<string, string>();
    for (const appt of appointments ?? []) {
      if (appt.client_phone && !phoneToApptName.has(appt.client_phone)) {
        phoneToApptName.set(appt.client_phone, appt.client_name ?? '');
      }
    }

    const globalLatestName = (appointments?.[0]?.client_name ?? memories?.[0]?.memory_value)?.trim() || null;

    function resolveNameForConversation(messages: Array<{ created_at: string; message: string; role: string }>): string | null {
      if (identityToMemoryName.size === 0 && phoneToApptName.size === 0) return null;

      const visitorMsgs = messages.filter((m) => m.role === 'visitor').slice(-8);
      for (const msg of visitorMsgs) {
        const raw = typeof msg.message === 'string' ? msg.message : '';
        let text = raw;
        try {
          const parsed = JSON.parse(raw);
          if (typeof parsed === 'object' && parsed !== null && typeof parsed.user === 'string') {
            text = parsed.user;
          }
        } catch {
          text = raw;
        }

        const phone = normalizeVisitorPhone(text);
        if (phone) {
          const memName = identityToMemoryName.get(`phone:${phone}`);
          if (memName) return memName;
          const apptName = phoneToApptName.get(phone) || phoneToApptName.get(phone.replace(/\D/g, ''));
          if (apptName) return apptName;
          return phone;
        }

        const email = normalizeVisitorEmail(text);
        if (email) {
          const memName = identityToMemoryName.get(`email:${email}`);
          if (memName) return memName;
          return email;
        }
      }
      return null;
    }

    const result = Array.from(convMap.values()).map((conv) => {
      const sorted = conv.messages.slice().sort((a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
      const first = sorted[0];
      const last = sorted[sorted.length - 1];
      const firstTime = first ? new Date(first.created_at) : new Date();
      const timeLabel = firstTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      const lastVisitor = sorted
        .filter((m) => m.role === 'visitor')
        .slice(-1)[0];
      const preview = getMessagePreview(lastVisitor?.message ?? last?.message ?? '');

      let label = preview || 'Visitor';
      const convName = resolveNameForConversation(sorted);
      if (convName && !label.toLowerCase().includes(convName.toLowerCase())) {
        label = `${convName} · ${label}`;
      } else if (globalLatestName && !label.toLowerCase().includes(globalLatestName.toLowerCase())) {
        label = `${globalLatestName} · ${label}`;
      }

      const lastMessageAt = last?.created_at ?? null;
      const lastReadAt = readStateMap.get(conv.id) ?? null;
      const hasUnread = lastMessageAt
        ? !lastReadAt || new Date(lastMessageAt) > new Date(lastReadAt)
        : false;

      return {
        id: conv.id,
        label: `${label} since ${timeLabel}`,
        lastMessageAt,
        messageCount: conv.messages.length,
        lastReadAt,
        hasUnread,
      };
    });

    result.sort((a, b) => {
      const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
      const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
      return bTime - aTime;
    });

    return NextResponse.json({ conversations: result });
  } catch (error) {
    console.error('[API_CHAT_CONVERSATIONS_UNEXPECTED]:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
