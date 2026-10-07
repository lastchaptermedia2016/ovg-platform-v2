import { supabaseAdmin } from '@/lib/supabase/admin';
import { getTenantBySlug } from '@/core/tenant/db';
import { NextResponse } from 'next/server';
import { parseVisitorContact, hasContactDetails } from '@/lib/ai/conversational-voice';

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/**
 * Pull the first visitor message in a conversation to use as the
 * `initial_intent` for a captured lead. Non-blocking: a fetch failure
 * degrades to the current message text.
 */
async function fetchInitialIntent(
  tenantInternalId: string,
  conversationId: string,
  fallback: string,
): Promise<string> {
  try {
    const { data, error } = await supabaseAdmin
      .from('chat_messages')
      .select('message, created_at')
      .eq('tenant_id', tenantInternalId)
      .eq('conversation_id', conversationId)
      .eq('role', 'visitor')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error || !data?.message) return fallback;
    return data.message;
  } catch {
    return fallback;
  }
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
        channel: 'widget',
        conversation_id: conversationId,
      });

    if (insertError) throw insertError;

    // ── Lead-Capture Interceptor ───────────────────────────────────────
    // When the visitor's latest message carries a phone number, persist
    // their contact details into tenant_appointments as a LEAD row. The
    // initial_intent is the first visitor message in the conversation (the
    // original booking request); the latest message supplies name + phone.
    // Non-blocking: a DB failure never interrupts the response the visitor
    // already received.
    if (hasContactDetails(message)) {
      const parsed = parseVisitorContact(message);
      if (parsed.phone) {
        const initialIntent = await fetchInitialIntent(
          tenant.id,
          conversationId,
          message.trim(),
        );
        try {
          await supabaseAdmin.from('tenant_appointments').insert({
            tenant_id: tenant.id,
            visitor_name: parsed.name,
            visitor_phone: parsed.phone,
            status: 'LEAD',
            initial_intent: initialIntent,
            start_time: new Date().toISOString(),
            end_time: new Date().toISOString(),
          });
        } catch {
          // Non-blocking: lead capture failure doesn't block the response
        }
      }
    }

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