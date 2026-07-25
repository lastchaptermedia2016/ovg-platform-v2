import { supabaseAdmin } from '@/lib/supabase/admin';
import { getTenantBySlug } from '@/core/tenant/db';
import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/auth/server';
import { applyMuteState } from '@/lib/chat/mute-state';

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await getUserFromRequest(request);

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized session' }, { status: 401 });
    }

    const { tenantId, message, conversationId } = await request.json();
    if (!tenantId || !message?.trim()) {
      return NextResponse.json({ error: 'Missing tenantId or message content' }, { status: 400 });
    }
    if (conversationId && typeof conversationId === 'string' && !isUuid(conversationId)) {
      return NextResponse.json({ error: 'Invalid conversationId' }, { status: 400 });
    }

    const tenant = await getTenantBySlug(tenantId, supabaseAdmin);
    if (!tenant) {
      return NextResponse.json({ error: 'Unknown tenant' }, { status: 400 });
    }

    const insertPayload: Record<string, unknown> = {
      tenant_id: tenant.id,
      sender_id: user.id,
      message: message.trim(),
      role: 'agent',
    };
    if (conversationId && isUuid(conversationId)) {
      insertPayload.conversation_id = conversationId;
    }

    const { error: insertError } = await supabaseAdmin
      .from('chat_messages')
      .insert(insertPayload);

    if (insertError) throw insertError;

    if (conversationId && isUuid(conversationId)) {
      await applyMuteState({
        conversationId,
        tenantId: tenant.id,
        isAiMuted: true,
        isHumanTakingOver: true,
        humanAgentId: user.id,
        handoverInitiatedAt: new Date().toISOString(),
        scheduledReenableAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      });
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    const raw = error instanceof Error ? error.message : JSON.stringify(error);
    const details = (error as { details?: string })?.details;
    const rawMsg = details ? `${raw} | ${details}` : raw;
    console.error('[API_CHAT_SEND_SERVICE_ERROR]:', rawMsg);
    return NextResponse.json(
      { error: `DATABASE_REJECTION: ${rawMsg}` },
      { status: 400 },
    );
  }
}
