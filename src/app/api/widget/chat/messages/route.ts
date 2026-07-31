import { supabaseAdmin } from '@/lib/supabase/admin';
import { getTenantBySlug } from '@/core/tenant/db';
import { NextRequest, NextResponse } from 'next/server';
import { isAnonRateLimited } from '@/lib/rate-limit/tenant-rate-limit';

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function clientIp(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]?.trim() || 'unknown';
  return req.headers.get('x-real-ip') ?? 'unknown';
}

export async function GET(request: NextRequest) {
  try {
    const tenantId = request.nextUrl.searchParams.get('tenantId');
    const conversationId = request.nextUrl.searchParams.get('conversationId');
    const since = request.nextUrl.searchParams.get('since');

    if (!tenantId || typeof tenantId !== 'string') {
      return NextResponse.json({ error: 'Missing tenantId' }, { status: 400 });
    }
    if (!conversationId || typeof conversationId !== 'string' || !isUuid(conversationId)) {
      return NextResponse.json({ error: 'Missing or invalid conversationId' }, { status: 400 });
    }

    const ip = clientIp(request);
    const limit = await isAnonRateLimited(tenantId, ip);
    if (limit.limited) {
      return NextResponse.json({ error: 'Rate limited' }, { status: 429 });
    }

    const tenant = await getTenantBySlug(tenantId, supabaseAdmin);
    if (!tenant) {
      return NextResponse.json({ error: 'Unknown tenant' }, { status: 404 });
    }

    const { data: messages, error: msgError } = await supabaseAdmin
      .from('chat_messages')
      .select('id, sender_id, message, role, created_at')
      .eq('tenant_id', tenant.id)
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(50);

    if (msgError) {
      console.error('[API_WIDGET_CHAT_MESSAGES_ERROR]:', msgError);
      return NextResponse.json({ error: 'Failed to load messages' }, { status: 500 });
    }

    const { data: muteRow, error: muteError } = await supabaseAdmin
      .from('conversation_mute_state')
      .select('is_ai_muted, is_human_taking_over, scheduled_reenable_at, handover_initiated_at')
      .eq('conversation_id', conversationId)
      .eq('tenant_id', tenant.id)
      .maybeSingle();

    if (muteError) {
      console.error('[API_WIDGET_CHAT_MUTE_ERROR]:', muteError);
    }

    let filteredMessages = messages ?? [];
    if (since) {
      const sinceDate = new Date(since);
      if (!Number.isNaN(sinceDate.getTime())) {
        filteredMessages = filteredMessages.filter((m) => new Date(m.created_at) > sinceDate);
      }
    }

    const muteState = muteRow
      ? {
          isAiMuted: muteRow.is_ai_muted ?? false,
          isHumanTakingOver: muteRow.is_human_taking_over ?? false,
          scheduledReenableAt: muteRow.scheduled_reenable_at ?? null,
          handoverInitiatedAt: muteRow.handover_initiated_at ?? null,
        }
      : {
          isAiMuted: false,
          isHumanTakingOver: false,
          scheduledReenableAt: null,
          handoverInitiatedAt: null,
        };

    return NextResponse.json({
      messages: filteredMessages,
      muteState,
    });
  } catch (error) {
    console.error('[API_WIDGET_CHAT_MESSAGES_UNEXPECTED]:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
