import { supabaseAdmin } from '@/lib/supabase/admin';
import { getTenantBySlug } from '@/core/tenant/db';
import { NextResponse } from 'next/server';

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export async function POST(request: Request) {
  try {
    const { tenantId, message, conversationId } = await request.json();
    if (!tenantId || !message?.trim()) {
      return NextResponse.json({ error: 'Missing tenantId or message content' }, { status: 400 });
    }
    if (!conversationId || typeof conversationId !== 'string' || !isUuid(conversationId)) {
      return NextResponse.json({ error: 'Missing or invalid conversationId' }, { status: 400 });
    }

    const tenant = await getTenantBySlug(tenantId, supabaseAdmin);
    if (!tenant) {
      return NextResponse.json({ error: 'Unknown tenant' }, { status: 400 });
    }

    const { error: insertError } = await supabaseAdmin
      .from('chat_messages')
      .insert({
        tenant_id: tenant.id,
        sender_id: null,
        message: message.trim(),
        role: 'visitor',
        conversation_id: conversationId,
      });

    if (insertError) throw insertError;

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    const raw = error instanceof Error ? error.message : JSON.stringify(error);
    const details = (error as { details?: string })?.details;
    const rawMsg = details ? `${raw} | ${details}` : raw;
    console.error('[API_CHAT_SEND_ANON_ERROR]:', rawMsg);
    return NextResponse.json(
      { error: `DATABASE_REJECTION: ${rawMsg}` },
      { status: 400 },
    );
  }
}