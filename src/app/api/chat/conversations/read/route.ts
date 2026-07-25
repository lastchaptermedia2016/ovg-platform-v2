import { supabaseAdmin } from '@/lib/supabase/admin';
import { getTenantBySlug } from '@/core/tenant/db';
import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/auth/server';

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export async function PATCH(request: NextRequest) {
  try {
    const { user } = await getUserFromRequest(request);

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized session' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const { tenantId, conversationId } = body as {
      tenantId?: string;
      conversationId?: string;
    };

    if (!tenantId || typeof tenantId !== 'string') {
      return NextResponse.json({ error: 'Missing tenantId' }, { status: 400 });
    }
    if (!conversationId || typeof conversationId !== 'string' || !isUuid(conversationId)) {
      return NextResponse.json({ error: 'Missing or invalid conversationId' }, { status: 400 });
    }

    const tenant = await getTenantBySlug(tenantId, supabaseAdmin);
    if (!tenant) {
      return NextResponse.json({ error: 'Unknown tenant' }, { status: 404 });
    }

    const { data: existing, error: fetchError } = await supabaseAdmin
      .from('chat_messages')
      .select('conversation_id')
      .eq('conversation_id', conversationId)
      .eq('tenant_id', tenant.id)
      .limit(1)
      .maybeSingle();

    if (fetchError) {
      console.error('[API_CHAT_CONVERSATIONS_READ_FETCH_ERROR]:', fetchError);
      return NextResponse.json({ error: 'Failed to verify conversation' }, { status: 500 });
    }

    if (!existing) {
      return NextResponse.json({ error: 'Conversation not found for this tenant' }, { status: 404 });
    }

    const { error: upsertError } = await supabaseAdmin
      .from('conversation_read_state')
      .upsert(
        {
          conversation_id: conversationId,
          user_id: user.id,
          last_read_at: new Date().toISOString(),
        },
        { onConflict: 'conversation_id,user_id' },
      );

    if (upsertError) {
      console.error('[API_CHAT_CONVERSATIONS_READ_UPSERT_ERROR]:', upsertError);
      return NextResponse.json({ error: 'Failed to update read state' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[API_CHAT_CONVERSATIONS_READ_UNEXPECTED]:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
