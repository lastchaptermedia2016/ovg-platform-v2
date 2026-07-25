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

    const body = await request.json().catch(() => ({}));
    const { tenantId, conversationId, action, minutes } = body as {
      tenantId?: string;
      conversationId?: string;
      action?: 'mute' | 'resume';
      minutes?: number;
    };

    if (!tenantId || typeof tenantId !== 'string') {
      return NextResponse.json({ error: 'Missing tenantId' }, { status: 400 });
    }
    if (!conversationId || typeof conversationId !== 'string' || !isUuid(conversationId)) {
      return NextResponse.json({ error: 'Missing or invalid conversationId' }, { status: 400 });
    }
    if (!action || !['mute', 'resume'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    const tenant = await getTenantBySlug(tenantId, supabaseAdmin);
    if (!tenant) {
      return NextResponse.json({ error: 'Unknown tenant' }, { status: 404 });
    }

    const { data: existing, error: fetchError } = await supabaseAdmin
      .from('conversation_mute_state')
      .select('tenant_id')
      .eq('conversation_id', conversationId)
      .maybeSingle();

    if (fetchError) {
      console.error('[API_CHAT_MUTE_FETCH_ERROR]:', fetchError);
      return NextResponse.json({ error: 'Failed to verify mute state' }, { status: 500 });
    }

    if (existing && existing.tenant_id !== tenant.id) {
      return NextResponse.json({ error: 'Conversation does not belong to tenant' }, { status: 403 });
    }

    if (action === 'mute') {
      const clampedMinutes = typeof minutes === 'number' ? Math.min(Math.max(minutes, 1), 1440) : 30;
      const scheduledReenableAt = new Date(Date.now() + clampedMinutes * 60 * 1000).toISOString();

      await applyMuteState({
        conversationId,
        tenantId: tenant.id,
        isAiMuted: true,
        isHumanTakingOver: true,
        humanAgentId: user.id,
        handoverInitiatedAt: new Date().toISOString(),
        autoReenableAi: true,
        reenableAfterMinutes: clampedMinutes,
        scheduledReenableAt,
      });
    } else {
      await applyMuteState({
        conversationId,
        tenantId: tenant.id,
        isAiMuted: false,
        isHumanTakingOver: false,
        scheduledReenableAt: null,
        autoReenableAi: false,
      });
    }

    return NextResponse.json({ success: true, action });
  } catch (error) {
    console.error('[API_CHAT_MUTE_UNEXPECTED]:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
