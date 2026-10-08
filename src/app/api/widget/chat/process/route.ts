/**
 * @file route.ts
 *
 * Public Widget Chat Process Endpoint
 *
 * This endpoint handles anonymous visitor messages from the public chat widget
 * embedded on third-party websites. It differs critically from /api/client/process-command:
 *
 * 1. NO authentication required (widget is public)
 * 2. Uses `surface: 'public'` to enforce behavioral boundaries
 * 3. Returns tenant-specific branding, not platform identity
 * 4. Rate-limited by IP to prevent abuse
 * 5. All responses are scoped to the tenant and cannot escalate to client/admin actions
 */

import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getTenantBySlug } from '@/core/tenant/db';
import { isAnonRateLimited } from '@/lib/rate-limit/tenant-rate-limit';
import { buildSystemPrompt, type KnowledgeEntry } from '@/lib/ai/system-prompt-builder';
import { getTenantKnowledgeContext, type KnowledgeItem } from '@/lib/reseller/tenant-knowledge-engine';

function clientIp(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]?.trim() || 'unknown';
  return req.headers.get('x-real-ip') ?? 'unknown';
}

/**
 * Deterministic greeting sanitizer.
 *
 * The LLM occasionally re-introduces itself mid-conversation despite the
 * system prompt instruction. This function strips any leading introductory
 * greeting from follow-up turns so the UI never shows a second "Hey there!
 * I'm [business]'s virtual assistant…" after the first message.
 *
 * Only fires when messageCount > 2 (i.e. there is already at least one
 * prior exchange — the initial greeting message + one user message).
 */
function sanitizeOngoingResponse(responseText: string, messageCount: number): string {
  if (messageCount > 2) {
    // Matches greetings like:
    //   "Hey there! I'm Zeeder's virtual assistant. What can I help you with today?"
    //   "Hello! I'm Demo Business's virtual assistant, powered by Zeeder technology."
    //   "Hi! I'm Acme's AI assistant. How can I help?"
    const introPattern =
      /^(?:Hey there!|Hello!|Hi!)\s+I'm\s+[^.!?]+(?:assistant|virtual assistant)[^.!?]*[.!?]\s*(?:What can I help you with(?: today)?[?!]\s*)?/i;
    return responseText.replace(introPattern, '').trim();
  }
  return responseText;
}

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'AI service not configured' },
        { status: 500 }
      );
    }

    const groq = new Groq({ apiKey });

    const { text: userMessage, tenantId, conversationId, messages: conversationHistory } = await request.json();

    if (!userMessage || typeof userMessage !== 'string' || !userMessage.trim()) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    if (!tenantId || typeof tenantId !== 'string') {
      return NextResponse.json({ error: 'tenantId is required' }, { status: 400 });
    }

    // Normalise conversation history — the widget sends WidgetMessage[] with
    // { role: 'assistant' | 'user', text: string }. We map to the Groq shape.
    // Exclude the current user message from history (it is appended separately).
    const priorMessages: Array<{ role: 'user' | 'assistant'; content: string }> =
      Array.isArray(conversationHistory)
        ? conversationHistory
            .filter(
              (m): m is { role: string; text: string } =>
                m != null &&
                typeof m === 'object' &&
                typeof m.text === 'string' &&
                (m.role === 'assistant' || m.role === 'user'),
            )
            .map((m) => ({
              role: m.role as 'user' | 'assistant',
              content: m.text,
            }))
        : [];

    // messageCount = prior turns + the incoming user message
    const messageCount = priorMessages.length + 1;

    // ── Rate Limiting (IP-based for anonymous visitors) ─────────────────
    const ip = clientIp(request);
    const rateLimitCheck = await isAnonRateLimited(tenantId, ip);
    if (rateLimitCheck.limited) {
      return NextResponse.json(
        { error: 'Rate limited. Please try again later.' },
        { status: 429 }
      );
    }

    // ── Tenant Resolution ──────────────────────────────────────────────
    // Use the same pattern as /api/widget/chat/messages which works correctly
    const tenant = await getTenantBySlug(tenantId, supabaseAdmin);
    if (!tenant) {
      return NextResponse.json({ error: 'Unknown tenant' }, { status: 404 });
    }

    // Fetch widget_config separately since getTenantBySlug doesn't include it
    let widgetConfig: Record<string, unknown> | null = null;
    try {
      const { data: tenantFullData } = await supabaseAdmin
        .from('tenants')
        .select('widget_config')
        .eq('id', tenant.id)
        .maybeSingle();
      widgetConfig = tenantFullData?.widget_config as Record<string, unknown> || null;
    } catch {
      // widget_config is optional
    }

    // ── Knowledge Base Fetch (optional) ────────────────────────────────
    // Pull custom product/service catalog for the tenant so the AI can
    // reference tenant-specific knowledge instead of generic platform catalog.
    let knowledgeEntries: KnowledgeEntry[] = [];
    try {
      const { items: kbItems, error: kbError } = await getTenantKnowledgeContext(
        tenant.id,
        supabaseAdmin
      );

      if (!kbError && kbItems && kbItems.length > 0) {
        knowledgeEntries = kbItems.map((item: KnowledgeItem): KnowledgeEntry => ({
          title: item.title,
          content: item.content,
          category: item.category ?? null,
        }));
      }
    } catch {
      // Knowledge base is optional; continue without it
      knowledgeEntries = [];
    }

    // ── System Prompt Hydration (PUBLIC SURFACE) ───────────────────────
    // Build system prompt with PUBLIC surface to enforce:
    // - Tenant identity (not platform identity)
    // - Behavioral boundaries (no client/admin escalation)
    // - Custom product catalog from knowledge base
    const systemPrompt = buildSystemPrompt(
      {
        id: tenant.id,
        tenant_id: tenant.tenant_id,
        name: tenant.name,
        system_prompt: tenant.system_prompt,
        preferred_voice: tenant.preferred_voice,
        pricing_tier_key: tenant.pricing_tier_key,
        show_ovg_branding: tenant.show_ovg_branding,
        branding_colors: tenant.branding_colors as Record<string, unknown>,
        widget_config: widgetConfig,
      },
      {}, // No client branding for public widget
      {}, // No memories for anonymous visitors
      'public', // ← PUBLIC SURFACE BOUNDARY
      knowledgeEntries
    );

    // ── User Message Persistence (audit trail) ────────────────────────
    try {
      await supabaseAdmin.from('chat_messages').insert({
        tenant_id: tenant.id,
        sender_id: null,
        message: userMessage.trim(),
        role: 'visitor',
        channel: 'widget',
        conversation_id: conversationId,
      });
    } catch {
      // Non-blocking: message logging failure doesn't block AI response
    }

    // ── AI Completion (Groq) ───────────────────────────────────────────
    // Non-streaming completion using the PUBLIC system prompt.
    // Conversation history is included so the model maintains context across
    // turns and doesn't re-introduce itself.
    const completion = await groq.chat.completions.create({
      model: 'openai/gpt-oss-20b',
      messages: [
        { role: 'system', content: systemPrompt },
        ...priorMessages,
        { role: 'user', content: userMessage.trim() },
      ],
      temperature: 0.7,
      max_tokens: 900,
      stream: false,
    });

    const rawAiResponse = completion.choices[0]?.message?.content || '';

    if (!rawAiResponse.trim()) {
      return NextResponse.json(
        { error: 'Failed to generate response' },
        { status: 500 }
      );
    }

    // ── Greeting Sanitizer ─────────────────────────────────────────────
    // Deterministically strip any accidental re-introduction on follow-up
    // turns — the LLM prompt alone cannot guarantee this 100% of the time.
    const aiResponse = sanitizeOngoingResponse(rawAiResponse.trim(), messageCount);

    // ── AI Response Persistence ────────────────────────────────────────
    try {
      await supabaseAdmin.from('chat_messages').insert({
        tenant_id: tenant.id,
        sender_id: null,
        message: aiResponse.trim(),
        role: 'agent',
        channel: 'widget',
        conversation_id: conversationId,
      });
    } catch {
      // Non-blocking: response logging failure doesn't block response return
    }

    // ── Lead capture moved to /api/chat/send-anon ──────────────────────
    // The widget UI submits visitor messages through send-anon, which owns
    // the lead-capture interceptor (parseVisitorContact + tenant_appointments
    // insert). Keeping capture there avoids double-inserts if both routes fire.

    return NextResponse.json({
      success: true,
      response: aiResponse.trim(),
      summary: aiResponse.trim(),
      actionType: 'CLIENT_NOP',
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('[API_WIDGET_CHAT_PROCESS_ERROR]:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
