/**
 * @file route.ts
 *
 * ZEEDER Client Process-Command API
 *
 * Surface-isolated voice-to-action bridge for the ZEEDER client surface.
 * This endpoint is the sovereign destination for `useZeederVoice` and contains
 * NO reseller data by construction — it never imports `src/lib/reseller/*`,
 * `src/contexts/HannahContext`, or `src/hooks/use-voice-command`. The boundary
 * is the endpoint itself, not the caller's identity, so a shared reseller+client
 * email cannot leak reseller capability state onto the client surface.
 *
 * @remarks
 * This module is intentionally **zero-dependency** with respect to the
 * reseller domain.
 */

import Groq from 'groq-sdk';
import type { SupabaseClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, createAuthClient } from '@/lib/auth/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getTenantId } from '@/core/tenant/tenant';
import { isAnonRateLimited } from '@/lib/rate-limit/tenant-rate-limit';
import { buildBookingCapture } from '@/lib/booking/booking-capture';
import { z } from 'zod';
import { zeederActionRegistry, isZeederActionId, type ZeederActionId } from '@/lib/zeeder/action-registry';
import { CLIENT_SYSTEM_REGISTRY, type ClientSystemItem, PAGE_WELCOME_GREETINGS } from '@/lib/client-system-registry';
import { extractPersonaMode, hasPersonaModeIntent } from '@/lib/ai/extract-persona-mode';
import { buildSystemPrompt, type KnowledgeEntry } from '@/lib/ai/system-prompt-builder';
import { getClientMemories, extractAndStoreMemories, type ClientMemoryMap } from '@/lib/ai/memory-service';
import { getVisitorMemories, extractAndStoreVisitorMemories, touchVisitorMemory, normalizeVisitorPhone, normalizeVisitorEmail, type VisitorIdentityType } from '@/lib/ai/memory-service';
import { resolveTenantId } from '@/lib/resolveTenantId';
import { logPlatformAction, persistChatMessage } from '@/lib/audit/platform-logger';
import {
  resolveActiveTools,
  INTEGRATION_TOOL_BY_NAME,
  FunctionCallSchema,
  type ToolDefinition,
} from '@/lib/ai/tools/integration-tools';
import { executeIntegrationTool } from '@/lib/ai/tools/integration-executors';
import { lookupDefinition, buildDefinitionResponse } from '@/lib/ai/definition-knowledge-base';

// ──────────────────────────── CORS ─────────────────────────────────────────
// Public, unauthenticated widget endpoint called from arbitrary third-party
// embed domains. Access-Control-Allow-Origin: '*' is a DELIBERATE, documented
// choice: the product must work on any client domain and a tenantId is already
// public by design. CORS is therefore NOT a security boundary here — rate
// limiting (see isAnonRateLimited) is the real abuse boundary. Do not assume
// '*' is safe by default elsewhere; it is scoped to this anon route on purpose.
const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function corsJson(body: ClientCommandResponse, status = 200): NextResponse<ClientCommandResponse> {
  return NextResponse.json(body, { status, headers: CORS_HEADERS });
}

function clientIp(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]?.trim() || 'unknown';
  return req.headers.get('x-real-ip') ?? 'unknown';
}

// ──────────────────────────── Types & Schemas ───────────────────────────

/**
 * Outbound response shape returned to the client surface.
 *
 * Mirrors the contract consumed by `useZeederVoice` (`data.actionType`,
 * mapped via `ACTION_TYPE_TO_ZEEDER_ID`) so no hook-side changes are required.
 */
export interface ClientCommandResponse {
  /** Whether the command was resolved to a dispatchable surface action. */
  success: boolean;
  /** The resolved SYSTEM_* / client action type. */
  actionType: string;
  /** Optional target identifiers (always empty for client-scoped actions). */
  targetIds?: string[];
  /** The payload to forward to the client dispatcher. */
  payload: Record<string, unknown>;
  /** Human-readable summary for TTS / UI feedback. */
  summary: string;
  /** Human-readable error message if `success` is false. */
  error?: string;
}

const CommandRequestSchema = z.object({
  text: z.string().min(1).max(2000),
  actionId: z.string().optional(),
  payload: z.record(z.unknown()).optional().default({}),
  currentPath: z.string().optional(),
  tenantId: z.string().min(1).max(200).optional(),
  testMode: z.boolean().optional().default(false),
  isTestDrive: z.boolean().optional().default(false),
  draftBrandName: z.string().optional(),
  draftVibe: z.string().optional(),
  draftPersona: z.string().optional(),
  conversationId: z.string().optional(),
  context: z
    .object({
      clientProfileId: z.string().optional(),
      activeView: z.string().optional(),
      clientMemories: z.record(z.string()).optional(),
      surface: z.string().optional(),
    })
    .optional(),
});

/**
 * Live, unsaved Studio overrides carried by a `testMode` request. The route
 * layers these over the saved profile when constructing the LLM system prompt
 * so the user can "test drive" an unsaved persona/brand before committing it.
 */
interface PreviewDraft {
  brandName?: string;
  vibe?: string;
  persona?: string;
}

// ──────────────────────────── Surface Mapping ───────────────────────────

/**
 * Inverse map: ZEEDER action id → client-surface SYSTEM_* action type.
 *
 * `useZeederVoice` reads `data.actionType` and reverses this map to dispatch
 * through `ZeederContext`. Only the client-safe intents are exposed.
 */
const ACTION_ID_TO_SYSTEM_TYPE: Record<string, string> = {
  updateBranding: 'SYSTEM_UPDATE_BRANDING',
  ai_update_persona: 'SYSTEM_UPDATE_PERSONA',
  ai_manage_memory: 'SYSTEM_MANAGE_MEMORY',
  ai_publish_studio_draft: 'SYSTEM_PUBLISH_DRAFT',
  fetchTelemetry: 'SYSTEM_TELEMETRY',
  toggleAgent: 'SYSTEM_TOGGLE_AGENT',
  navigate: 'SYSTEM_NAVIGATE',
};

/**
 * Client-scoped help/option intents. Broadened to the reseller route's set so
 * the client surface resolves help deterministically without a Groq round-trip.
 */
/**
 * Pure capability/help questions that resolve to a canned `SYSTEM_HELP` block.
 * Deliberately narrow: it must NOT match educational "how do / how to / where
 * is" queries — those are informational and must reach the LLM so it can return
 * a page-aware, step-by-step UI guide (see DYNAMIC PAGE CONTEXT RULE).
 */
const CLIENT_HELP_INTENT_REGEX =
  /^(what can you do|help|list commands|list capabilities|what are my options|capabilities|commands|what commands|show commands|show help|show capabilities|what can i do|how does this work|what are the commands|what should i say|what can i say)/i;

/**
 * Definition / terminology queries ("what is Zeeder", "explain a signal",
 * "what are the platform features", "what is a widget body"). These are
 * definitional/FAQ-style, NOT how-to guidance. Routed to semantic fallback
 * with definitionQuery=true to enable knowledge-base lookup before the LLM
 * round-trip (caching FAQ answers). Normalized matching strips punctuation.
 * Narrow pattern to avoid matching educational "what is the color picker"
 * (which is a how-to, not a definition).
 */
const CLIENT_DEFINITION_INTENT_REGEX =
  /^(what is|what are|explain|define|tell me|can you explain|can you tell me)\s+(?:the\s+)?(a\s+)?(zeeder|signal|feature|capability|integration|widget|widget\s+body|platform|system|branding|persona|ai|assistant)/i;

/**
 * Informational / how-to queries ("how do I upload my logo", "where is the
 * color picker", "help me with the header text"). These are educational, not
 * capability listings, so they bypass the static `SYSTEM_HELP` block and are
 * forwarded to the LLM (`runSemanticFallback`) where the active-page context
 * rule produces a live on-screen guide from the hydrated system prompt.
 */
const CLIENT_INFORMATIONAL_INTENT_REGEX =
  /(^|\b)(how do|how to|how can i|where is|where can i|can you show me|show me how|help me with|help me set up|guide me|walk me through|explain|what is|what are|tell me about)/i;

/**
 * Persona-page navigation intent. Matches explicit "go to / open / show / take
 * me to the persona" phrasing (page/settings/configurations/tab/view) WITHOUT
 * requiring a concrete mode ("sales"/"concierge"). This is distinct from
 * `hasPersonaModeIntent` (which needs a change verb to avoid false positives on
 * educational mentions). Pure navigation ("open the persona page") must resolve
 * deterministically to the unified Studio dashboard — where Branding and Persona
 * are co-located sibling viewports — exactly like the branding navigation path.
 *
 * A negative lookahead on the mode keywords ("sales"/"concierge") keeps mode
 * directives ("switch persona to concierge") on the `hasPersonaModeIntent`
 * path so the `aiPersona.personaMode` payload is still injected.
 */
const CLIENT_PERSONA_NAV_INTENT_REGEX =
  /\b(open|show|take|go|navigate|visit|jump|get|load|display|access|launch)\b(?!.*\b(sales|concierge)\b).{0,25}\b(persona|ai persona|persona settings|persona configurations|persona tab|persona view|persona page)\b/i;

/**
 * Identity questions ("what is your name", "who are you") must always resolve
 * deterministically to the canonical ZEEDER name reply. We short-circuit the
 * LLM here so a flaky model can never dodge the identity contract with a
 * non-naming reply (e.g. "I'm happy to share my name with you.").
 */
const CLIENT_IDENTITY_INTENT_REGEX =
  /(who\s+(?:are|re)\s+(?:you|u)\b)|(what(?:'s| is|\s+is)?\s+(?:your|ur|the)?\s*name\b)|(?:tell me\s+)?your\s+name\b|(your\s+identity\b)|(what\s+is\s+your\s+identity\b)/i;

const CLIENT_DISARM_INTENT_REGEX =
  /^(stop|cancel|never\s?mind|forget\s?it|end|goodbye|no\s?thanks|that'?s\s?all|nevermind|nvm|abort|quit|close|hang\s?up)/i;


/**
 * Concrete, dispatchable example utterances surfaced in the `SYSTEM_HELP`
 * summary. Intentionally excludes help synonyms (e.g. "List capabilities")
 * which would re-match `CLIENT_HELP_INTENT_REGEX` and create a repeat loop.
 */
const HELP_VOICE_EXAMPLES = ['Update my branding', 'Show my telemetry'];

/**
 * Static product catalog (USD + ZAR) used for resilient, offline-safe
 * answers when the LLM is unavailable. Mirrors the prompt-builder catalog so
 * informational add-on questions ("What is smart booking?") always return a
 * rich, correctly-priced reply even if the Groq call throws.
 */
interface ProductAddon {
  match: RegExp;
  name: string;
  value: string;
  setupUsd: number;
  setupZar: number;
  monthlyUsd: number;
  monthlyZar: number;
}

const PRODUCT_ADDONS: ProductAddon[] = [
  {
    match: /(smart\s?booking|calendar\s?sync|book|appointment|schedul)/i,
    name: 'Smart Booking & Calendar Sync',
    value: 'let the AI concierge book appointments directly into your calendar.',
    setupUsd: 199, setupZar: 3250, monthlyUsd: 39, monthlyZar: 640,
  },
  {
    match: /(live\s?inventory|inventory|commerce|catalog|stock|product\s?avail)/i,
    name: 'Live Inventory & Commerce',
    value: 'surface live stock and product availability inside every conversation.',
    setupUsd: 299, setupZar: 4900, monthlyUsd: 69, monthlyZar: 1130,
  },
  {
    match: /(crm|lead\s?sync|hubspot|salesforce|pipeline)/i,
    name: 'CRM Lead Sync',
    value: 'auto-push qualified leads and transcripts into your CRM pipeline.',
    setupUsd: 149, setupZar: 2450, monthlyUsd: 29, monthlyZar: 480,
  },
  {
    match: /(vector|knowledge\s?base|rag|rag|faq|manual|pdf|embed)/i,
    name: 'Vector Knowledge-Base',
    value: 'train the assistant on your manuals, policies, and FAQs via PDF uploads.',
    setupUsd: 249, setupZar: 4100, monthlyUsd: 49, monthlyZar: 800,
  },
  {
    match: /(whatsapp|sms|handover|messaging|multi.?channel)/i,
    name: 'WhatsApp / SMS Handover',
    value: 'hand off web chat conversations to WhatsApp or SMS without losing context.',
    setupUsd: 149, setupZar: 2450, monthlyUsd: 39, monthlyZar: 640,
  },
];

/**
 * Build a rich, on-brand reply for an add-on question from the static catalog,
 * used as a fallback when the LLM is unreachable. Returns null when the text
 * does not appear to be about an add-on (so other fallbacks can apply).
 */
function buildLocalAddonAnswer(text: string): string | null {
  for (const addon of PRODUCT_ADDONS) {
    if (addon.match.test(text)) {
      const setup = '\u0024' + addon.setupUsd + ' / R' + addon.setupZar.toLocaleString('en-ZA');
      const monthly = '\u0024' + addon.monthlyUsd + ' / R' + addon.monthlyZar.toLocaleString('en-ZA');
      return (
        addon.name + ' lets ' + addon.value + ' ' +
        'Pricing: a once-off setup of ' + setup + ' and a monthly recurring fee of ' + monthly + '. ' +
        'Your Reseller can also activate and set up these premium integrations directly on your behalf — ' +
        'just head to the "Integrations" tab in your Studio dashboard to configure it.'
      );
    }
  }
  return null;
}

/**
 * Capability labels surfaced for a client `SYSTEM_HELP` response.
 *
 * Iterates the client registry, projecting each `ClientSystemItem` to its
 * `label`, and strictly bypasses `requiresAuth` items so no higher-privilege
 * surface is advertised. `brandingCapabilities` is stripped entirely (always {}).
 */
function buildClientCapabilities(): string[] {
  return Object.values(CLIENT_SYSTEM_REGISTRY)
    .flat()
    .filter((item: ClientSystemItem) => !item.requiresAuth)
    .map((item: ClientSystemItem) => item.label);
}

/**
 * Render the active integration tools as an injection-safe "available
 * functions" contract appended to the system prompt. The LLM is instructed to
 * emit a `functionCall` object inside its JSON response when it decides to use
 * one. This avoids the Groq `tools` + `response_format: json_object`
 * incompatibility while keeping the tool surface dynamic and client-scoped.
 *
 * Returns an empty string when no integrations are active, so the prompt is
 * unchanged for tenants without integrations (no routing regression).
 */
function buildIntegrationToolsPrompt(tools: ToolDefinition[]): string {
  if (tools.length === 0) return '';
  const blocks = tools.map((tool) => {
    const params = Object.entries(tool.parameters)
      .map(([key, p]) => `      - "${key}" (${p.type}): ${p.description}`)
      .join('\n');
    return [
      `   - ${tool.name}: ${tool.description}`,
      `     Parameters:`,
      params,
    ].join('\n');
  });
  return [
    '',
    '=== AVAILABLE INTEGRATION FUNCTIONS ===',
    'If the user request clearly matches an integration function below, respond with a `functionCall` object (in addition to the standard `actionType`/`summary`) like:',
    '   { "actionType": "CLIENT_NOP", "summary": "...", "functionCall": { "name": "<function>", "arguments": { ... } } }',
    'Only emit `functionCall` for functions listed here and only when the user explicitly asks for that capability. Do not invent functions.',
    ...blocks,
  ].join('\n');
}

/**
 * Safely extract a `functionCall` from the LLM's parsed JSON response.
 * Returns null when absent or invalid so the pipeline degrades gracefully.
 */
function parseFunctionCall(
  parsed: Record<string, unknown>,
): { name: string; arguments: Record<string, unknown> } | null {
  const raw = parsed.functionCall;
  if (!raw || typeof raw !== 'object') return null;
  const result = FunctionCallSchema.safeParse(raw);
  return result.success ? result.data : null;
}

/**
 * Tier 2 "Pivot & Pull" behavioral contract for the semantic fallback layer.
 *
 * The conversational system prompt is now built dynamically and injection-safe
 * by `buildSystemPrompt` (from `@/lib/ai/system-prompt-builder`) inside
 * `runSemanticFallback`, which hydrates it from the server-resolved tenant's
 * live branding/config. The prompt is strictly client-scoped: it enumerates
 * the portal's real capabilities and forbids any reseller/administrative
 * concept, so the LLM can never escalate or leak a higher-privilege surface.
 */

/**
 * Booking intent. Matches "book / appointment / schedule / reserve / reschedule"
 * so the utterance is routed to the semantic fallback where the LLM extracts
 * structured fields (firstName, phone, treatment, …) into a SYSTEM_BOOKING_CAPTURE
 * payload. Kept broad + intent-level; the actual field capture is the LLM's job.
 */
const CLIENT_BOOKING_INTENT_REGEX =
  /(book|booking|appointment|schedule|reschedule|reserve|slot)/i;

/**
 * Allowed actionTypes the semantic fallback may surface. Anonymous callers are
 * restricted to plain conversation + the visitor-facing help line + booking
 * capture. Authenticated clients additionally get branding / telemetry (their
 * own config, mutated only by themselves) — but NEVER integration functionCalls
 * (those are gated separately for anon below).
 */
function allowedActions(isAnon: boolean): Set<string> {
  return isAnon
    ? new Set(['CLIENT_NOP', 'SYSTEM_HELP', 'SYSTEM_BOOKING_CAPTURE', 'SYSTEM_EXPLAIN'])
    : new Set([
        'CLIENT_NOP',
        'SYSTEM_UPDATE_BRANDING',
        'SYSTEM_UPDATE_PERSONA',
        'SYSTEM_MANAGE_MEMORY',
        'SYSTEM_PUBLISH_DRAFT',
        'SYSTEM_TELEMETRY',
        'SYSTEM_TOGGLE_AGENT',
        'SYSTEM_NAVIGATE',
        'SYSTEM_HELP',
        'SYSTEM_BOOKING_CAPTURE',
        'SYSTEM_EXPLAIN',
      ]);
}

// ──────────────────────────── Intent Parsing ────────────────────────────

/**
 * Simple keyword-to-actionId mapping for client intents.
 *
 * @param text - The user's natural-language input.
 * @returns A resolved action id, or null if no action matches.
 */
function parseIntent(text: string): ZeederActionId | null {
  const lower = text.toLowerCase().trim();

  // ── updateBranding ───────────────────────────────────────────────────
  if (
    /(update|change|set|apply)\s.*(brand|theme|color|logo|styl)/i.test(lower) ||
    /branding/i.test(lower)
  ) {
    return 'updateBranding';
  }

  // ── toggleAgent ──────────────────────────────────────────────────────
  if (/(enable|disable|toggle|activate|deactivate)\s+(agent|ai)/i.test(lower)) {
    return 'toggleAgent';
  }

  // ── fetchTelemetry ───────────────────────────────────────────────────
  if (/(telemetry|metrics|health|status|performance|stats|signal)/i.test(lower)) {
    return 'fetchTelemetry';
  }

  // ── navigate ─────────────────────────────────────────
  // Matches explicit navigation intents to client dashboard tabs.
  if (
    /(go to|navigate to|open|show|take me to|jump to|switch to|move to|visit)\b.*\b(branding|persona|knowledge|integrations|analytics|studio|dashboard|main\s+page|overview|home|main\s+dashboard)\b/i.test(lower) ||
    /^(go to|navigate to|open|show|take me to|jump to|switch to|move to|visit)\s+(branding|persona|knowledge|integrations|analytics|studio|dashboard|main\s+page|overview|home|main\s+dashboard)/i.test(lower)
  ) {
    return 'navigate';
  }

  // ── ai_manage_memory ───────────────────────────────────────────────────
  if (/(remember|add\s+(?:a\s+)?memory|delete\s+(?:a\s+)?memory|search\s+(?:my\s+)?memories|find\s+(?:a\s+)?memory)/i.test(lower)) {
    return 'ai_manage_memory';
  }

  // ── ai_publish_studio_draft ────────────────────────────────────────────
  if (/(publish\s+(?:my\s+)?changes|commit\s+(?:my\s+)?draft|go\s+live|publish)/i.test(lower)) {
    return 'ai_publish_studio_draft';
  }

  // ── Persona mode directive ──────────────────────────────────────────
  // A persona-mode switch resolves at Tier 1 (deterministic, no LLM
  // round-trip) by riding the existing `updateBranding` action. The resolved
  // mode is injected into the response payload in the POST handler, where
  // `useZeederVoice` intercepts it and dispatches `UPDATE_PERSONA`.
  if (extractPersonaMode(text)) {
    return 'updateBranding';
  }

  return null;
}

// ──────────────────────────── Route Handler ─────────────────────────────

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<NextResponse<ClientCommandResponse>> {
  // ── Session resolution (server-authoritative) ───────────────────────
  // Authenticated callers resolve the tenant from their session. Anonymous
  // embed visitors (no session) resolve the tenant from the client-supplied
  // tenantId via supabaseAdmin — a lookup key only, never an identity.
  const { userId } = await getAuthenticatedUser();
  let isAnon = !userId;

  // ── Parse & Validate (Zod gates malformed bodies) ───────────────────
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return corsJson(
      {
        success: false,
        actionType: 'CLIENT_NOP',
        targetIds: [],
        payload: {},
        summary: 'Invalid request body.',
        error: 'Malformed JSON.',
      },
      400,
    );
  }

  let parsed: z.infer<typeof CommandRequestSchema>;
  try {
    parsed = CommandRequestSchema.parse(raw);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Invalid request parameters.';
    console.error('[CLIENT_PROCESS_COMMAND] Schema validation failed:', {
      message,
      rawBody: JSON.stringify(raw).substring(0, 200),
      error: err,
    });
    return corsJson(
      {
        success: false,
        actionType: 'CLIENT_NOP',
        targetIds: [],
        payload: {},
        summary: 'Invalid request parameters.',
        error: message,
      },
      400,
    );
  }

  const {
    text,
    actionId: rawActionId,
    payload: payloadOverrides,
    currentPath,
    tenantId: suppliedTenantId,
    draftBrandName,
    draftVibe,
    draftPersona,
    conversationId,
  } = parsed;

  const isWidgetSurface = parsed.context?.surface === 'chat-widget-embed';
  if (isWidgetSurface) {
    isAnon = true;
  }

  // ── Tenant resolution ───────────────────────────────────────────────
  let resolvedTenantId: string | null = null;
  const supabase = await createAuthClient();

  if (!isAnon) {
    const { data } = await resolveTenantId(userId!, supabase);
    resolvedTenantId = data;
  } else {
    const key = getTenantId(suppliedTenantId);
    if (!key || key === 'demo') {
      return corsJson(
        {
          success: false,
          actionType: 'CLIENT_NOP',
          targetIds: [],
          payload: {},
          summary: 'Missing tenant',
          error: 'Missing tenant',
        },
        400,
      );
    }
    // text tenant_id -> internal id (bypasses RLS via admin client)
    const byTenantId = await supabaseAdmin
      .from('tenants')
      .select('id')
      .eq('tenant_id', key)
      .maybeSingle();
    const found = byTenantId.data ?? (await supabaseAdmin.from('tenants').select('id').eq('id', key).maybeSingle()).data;
    resolvedTenantId = (found?.id as string | undefined) ?? null;
    if (!resolvedTenantId) {
      return corsJson(
        {
          success: false,
          actionType: 'CLIENT_NOP',
          targetIds: [],
          payload: {},
          summary: 'Unknown tenant',
          error: 'Unknown tenant',
        },
        404,
      );
    }

    // ── Anonymous abuse protection (the real security boundary; see CORS note) ──
    // Dual-key Supabase limiter: per-IP burst + global tenant volume. Runs AFTER
    // tenant resolution but BEFORE any LLM/TTS spend.
    const limit = await isAnonRateLimited(resolvedTenantId, clientIp(request));
    if (limit.limited) {
      return corsJson(
        {
          success: false,
          actionType: 'CLIENT_NOP',
          targetIds: [],
          payload: {},
          summary: 'Too many requests, please slow down.',
          error: 'Rate limited',
        },
        429,
      );
    }
  }

  const tenantId = resolvedTenantId;
  const testMode = parsed.testMode === true || parsed.isTestDrive === true;

  const previewDraft: PreviewDraft = {};
  if (draftBrandName) previewDraft.brandName = draftBrandName;
  if (draftVibe) previewDraft.vibe = draftVibe;
  if (draftPersona) previewDraft.persona = draftPersona;

  if (conversationId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(conversationId)) {
    const tenantIdForMute = resolvedTenantId ?? suppliedTenantId;
    const { data: muteRow } = await supabaseAdmin
      .from('conversation_mute_state')
      .select('is_ai_muted, scheduled_reenable_at')
      .eq('conversation_id', conversationId)
      .eq('tenant_id', tenantIdForMute)
      .maybeSingle();

    const isMuted = muteRow?.is_ai_muted && (!muteRow.scheduled_reenable_at || new Date(muteRow.scheduled_reenable_at) > new Date());
    if (isMuted) {
      return corsJson({
        success: true,
        actionType: 'CLIENT_NOP',
        targetIds: [],
        payload: {},
        summary: 'A human agent is currently handling this conversation.',
      });
    }
  }

  // Anonymous callers persist nothing to chat_messages / platform_actions
  // (no session => no userId, and we must not mutate tenant config). Only an
  // explicit booking capture writes a lead row (see SYSTEM_BOOKING_CAPTURE).
  async function tryPersistCommand(
    response: ClientCommandResponse,
    actionType: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    if (testMode || isAnon) return;
    try {
      await persistChatMessage(supabase, tenantId, userId!, text, {
        actionType: response.actionType,
        summary: response.summary,
      });
      if (!['CLIENT_NOP', 'SYSTEM_HELP'].includes(actionType)) {
        await logPlatformAction({
          supabase,
          tenantId,
          userId: userId!,
          actionId: actionType,
          params: payload,
          result: response.payload,
          surface: 'client',
        });
      }
    } catch (err) {
      console.error('[process-command] Persistence error:', err);
    }
  }

  // ── Resolve actionId ────────────────────────────────────────────────
  let resolvedActionId: ZeederActionId | null = null;

  if (rawActionId) {
    if (isZeederActionId(rawActionId)) {
      resolvedActionId = rawActionId;
    } else {
      return NextResponse.json(
        {
          success: false,
          actionType: 'CLIENT_NOP',
          targetIds: [],
          payload: {},
          summary: `Unknown action "${rawActionId}".`,
          error: `"${rawActionId}" is not a registered ZEEDER action.`,
        },
        { status: 400 },
      );
    }
  } else {
    resolvedActionId = parseIntent(text);
  }

  // ── Persona-page navigation → deterministic Studio navigation ─────────
  // BLOCKED for anonymous visitors: this resolves to SYSTEM_UPDATE_BRANDING,
  // a tenant-config mutation no public embed caller may trigger.
  if (!isAnon && CLIENT_PERSONA_NAV_INTENT_REGEX.test(text.trim())) {
    // The Persona viewport is a distinct route on the unified Studio dashboard
    // (/client/dashboard/studio/persona). Rather than asking the user to click
    // the tab manually, always navigate them there by returning the navigation
    // action with an explicit `tab: 'persona'` payload. The voice hook reads
    // this and router.push()es to the persona route directly.
    const data: ClientCommandResponse = {
      success: true,
      actionType: 'SYSTEM_UPDATE_BRANDING',
      targetIds: [],
      payload: { ...payloadOverrides, tab: 'persona' },
      summary:
        "Sure thing! I've opened your AI Persona settings — you can fine-tune its voice, tone, and behavior right here.",
    };
    const response = NextResponse.json(data);
    await tryPersistCommand(data, 'SYSTEM_UPDATE_BRANDING', data.payload);
    return response;
  }

  // ── Persona intent without a target mode → screen-aware clarification ──
  // BLOCKED for anonymous visitors (resolves to branding/persona mutation).
  if (!isAnon && hasPersonaModeIntent(text)) {
    const onStudio = currentPath === '/client/dashboard/studio/branding';
    if (onStudio) {
      const data: ClientCommandResponse = {
        success: true,
        actionType: 'CLIENT_NOP',
        targetIds: [],
        payload: {},
        summary:
          "We're looking right at your Studio configurations together! You can toggle between sales or concierge mode right here on your screen. Which one would you like to set?",
      };
      const response = NextResponse.json(data);
      await tryPersistCommand(data, 'CLIENT_NOP', {});
      return response;
    }
    const data: ClientCommandResponse = {
      success: true,
      actionType: 'SYSTEM_UPDATE_BRANDING',
      targetIds: [],
      payload: payloadOverrides,
      summary:
        "Sure thing! I've pulled up your Studio dashboard where you can adjust both your visual Branding and AI Persona. Which mode are we setting today—sales or concierge?",
    };
    const response = NextResponse.json(data);
    await tryPersistCommand(data, 'SYSTEM_UPDATE_BRANDING', payloadOverrides);
    return response;
  }

  // ── Identity question → deterministic identity response ──────────────
  // "who are you" / "what is your name" resolve to a surface-appropriate
  // identity reply without any LLM round-trip. Anonymous visitors hear the
  // host business name, not the internal "ZEEDER Client Portal assistant" label.
  if (CLIENT_IDENTITY_INTENT_REGEX.test(text.trim())) {
    if (isAnon) {
      const { data: tenantNameRow } = await supabaseAdmin
        .from('tenants')
        .select('name')
        .eq('id', tenantId)
        .maybeSingle();
      const businessName = tenantNameRow?.name?.trim() || 'our';
      const data: ClientCommandResponse = {
        success: true,
        actionType: 'CLIENT_NOP',
        targetIds: [],
        payload: {},
        summary: `I'm ${businessName}'s AI assistant. How can I help you today?`,
      };
      const response = NextResponse.json(data);
      await tryPersistCommand(data, 'CLIENT_NOP', {});
      return response;
    }
    const data: ClientCommandResponse = {
      success: true,
      actionType: 'CLIENT_NOP',
      targetIds: [],
      payload: {},
      summary: "I'm ZEEDER, your Client Portal assistant.",
    };
    const response = NextResponse.json(data);
    await tryPersistCommand(data, 'CLIENT_NOP', {});
    return response;
  }

  // ── Disarm / stop / cancel intent → graceful acknowledgement ─────────
  // Matches cancellation phrases so they never fall through to the LLM as
  // unhandled conversational noise.
  if (CLIENT_DISARM_INTENT_REGEX.test(text.trim())) {
    if (isAnon) {
      const { data: tenantNameRow } = await supabaseAdmin
        .from('tenants')
        .select('name')
        .eq('id', tenantId)
        .maybeSingle();
      const businessName = tenantNameRow?.name?.trim() || 'our';
      const data: ClientCommandResponse = {
        success: true,
        actionType: 'CLIENT_NOP',
        targetIds: [],
        payload: {},
        summary: `No problem at all! Feel free to come back anytime if you have more questions about ${businessName}.`,
      };
      const response = NextResponse.json(data);
      await tryPersistCommand(data, 'CLIENT_NOP', {});
      return response;
    }
    const data: ClientCommandResponse = {
      success: true,
      actionType: 'CLIENT_NOP',
      targetIds: [],
      payload: {},
      summary: "Of course — I'm here whenever you need me. Just say the word.",
    };
    const response = NextResponse.json(data);
    await tryPersistCommand(data, 'CLIENT_NOP', {});
    return response;
  }

  // ── Booking intent → semantic fallback (structured field capture) ──
  // Routes to runSemanticFallback with bookingIntent=true. Booking is allowed
  // for both anon and authenticated callers (it's the core public use-case).
  // bookingIntent FORCES the SYSTEM_BOOKING_CAPTURE path regardless of the
  // model's self-labeled actionType, so capture is deterministic (the model
  // does not reliably emit the exact actionType string on its own).
  if (CLIENT_BOOKING_INTENT_REGEX.test(text.trim())) {
    return runSemanticFallback(text, currentPath, previewDraft, {
      supabase,
      tenantId,
      userId,
      testMode,
      isAnon,
      bookingIntent: true,
      clientMemories: parsed.context?.clientMemories,
    });
  }

  // ── Definition / terminology queries → deterministic knowledge base lookup ──
  // Queries like "what is Zeeder", "explain signals", "what are integrations"
  // are definitional/FAQ-style and can be answered from a cached knowledge base
  // without an LLM round-trip. Returns immediately if matched, otherwise falls
  // through to the semantic fallback.
  if (CLIENT_DEFINITION_INTENT_REGEX.test(text.trim())) {
    const matched = lookupDefinition(text);
    if (matched) {
      const data: ClientCommandResponse = {
        success: true,
        actionType: 'SYSTEM_EXPLAIN',
        targetIds: [],
        payload: { term: matched.title },
        summary: buildDefinitionResponse(matched),
      };
      const response = corsJson(data);
      await tryPersistCommand(data, 'SYSTEM_EXPLAIN', data.payload);
      return response;
    }
    // No definition matched; fall through to semantic fallback for LLM answer
    return runSemanticFallback(text, currentPath, previewDraft, {
      supabase,
      tenantId,
      userId,
      testMode,
      isAnon,
      bookingIntent: false,
      definitionQuery: true,
      clientMemories: parsed.context?.clientMemories,
    });
  }

  // ── Informational / how-to queries → LLM (never the canned HELP block) ──
  // Questions like "how do I upload my logo" or "Tell me about your products"
  // are educational/topic-specific, not capability listings. Route them to the
  // semantic fallback (runSemanticFallback) so the agent returns a page-aware,
  // step-by-step UI guide or KB-informed response instead of the static
  // SYSTEM_HELP response. This must run BEFORE the help check so topic-specific
  // queries are never hijacked by the help regex.
  if (CLIENT_INFORMATIONAL_INTENT_REGEX.test(text.trim())) {
    return runSemanticFallback(text, currentPath, previewDraft, {
      supabase,
      tenantId,
      userId,
      testMode,
      isAnon,
      bookingIntent: false,
      clientMemories: parsed.context?.clientMemories,
    });
  }

  // ── Pre-LLM help short-circuit (isolated client capabilities) ───────
  // Pure capability/help questions that resolve to a canned `SYSTEM_HELP` block.
  // Runs AFTER definition and informational checks so specific product/service
  // queries ("Tell me about your products") don't get hijacked by help regex.
  if (CLIENT_HELP_INTENT_REGEX.test(text.trim())) {
    // Anonymous visitors get a personalized, visitor-facing line hydrated with
    // the host business name. We do NOT surface the Studio capability list /
    // brandingCapabilities — those are internal platform detail not meant for
    // a public embed. Authenticated clients keep the full capability listing.
    if (isAnon) {
      const { data: tenantNameRow } = await supabaseAdmin
        .from('tenants')
        .select('name')
        .eq('id', tenantId)
        .maybeSingle();
      const businessName = tenantNameRow?.name?.trim() || 'our';
      return corsJson({
        success: true,
        actionType: 'SYSTEM_HELP',
        targetIds: [],
        payload: {},
        summary: `I'm ${businessName}'s AI assistant. I can help you book appointments or answer questions about our services. What would you like to know?`,
      });
    }
    const availableCommands = buildClientCapabilities();
    const data: ClientCommandResponse = {
      success: true,
      actionType: 'SYSTEM_HELP',
      targetIds: [],
      payload: {
        availableCommands,
        brandingCapabilities: {},
      },
      summary:
        'Here are the things you can ask me to do in your client portal. ' +
        'Try saying: "' + (HELP_VOICE_EXAMPLES[0] ?? availableCommands[0] ?? 'List capabilities') + '".',
    };
    const response = NextResponse.json(data);
    await tryPersistCommand(data, 'SYSTEM_HELP', {});
    return response;
  }

  // ── Tier 1 miss → Tier 2 Semantic Fallback (Conversational Border) ──
  // The deterministic regex pass resolved nothing, so we hand the utterance to
  // a client-scoped LLM completion that performs the "Pivot & Pull" and keeps
  // the user corralled within the client surface. If the LLM is unavailable or
  // errors, it degrades to the same graceful CLIENT_NOP.
  if (!resolvedActionId) {
    return runSemanticFallback(text, currentPath, previewDraft, {
      supabase,
      tenantId,
      userId,
      testMode,
      isAnon,
      bookingIntent: false,
      clientMemories: parsed.context?.clientMemories,
    });
  }

  const systemType = ACTION_ID_TO_SYSTEM_TYPE[resolvedActionId];
  if (!systemType) {
    const data: ClientCommandResponse = {
      success: true,
      actionType: 'CLIENT_NOP',
      targetIds: [],
      payload: {},
      summary: 'That command isn\'t available on the client surface.',
    };
    const response = NextResponse.json(data);
    await tryPersistCommand(data, 'CLIENT_NOP', {});
    return response;
  }

  // BLOCK for anonymous visitors: the only Tier-1 system actions are branding
  // mutations and telemetry reads — neither may be triggered by a public embed.
  // Personalize the degradation response with the host business name.
  if (isAnon && (systemType === 'SYSTEM_UPDATE_BRANDING' || systemType === 'SYSTEM_UPDATE_PERSONA' || systemType === 'SYSTEM_MANAGE_MEMORY' || systemType === 'SYSTEM_PUBLISH_DRAFT' || systemType === 'SYSTEM_TELEMETRY')) {
    const { data: tenantNameRow } = await supabaseAdmin
      .from('tenants')
      .select('name')
      .eq('id', tenantId)
      .maybeSingle();
    const businessName = tenantNameRow?.name?.trim() || 'us';
    return corsJson({
      success: true,
      actionType: 'CLIENT_NOP',
      targetIds: [],
      payload: {},
      summary: `I'm ${businessName}'s AI assistant. I can help you book, reschedule, or answer questions about our services.`,
    });
  }

  // Confirm the action still exists in the registry.
  const entry = zeederActionRegistry.get(resolvedActionId);
  if (!entry) {
    return NextResponse.json(
      {
        success: false,
        actionType: 'CLIENT_NOP',
        targetIds: [],
        payload: {},
        summary: `Action "${resolvedActionId}" is not registered.`,
        error: `Registry missing entry for "${resolvedActionId}".`,
      },
      { status: 500 },
    );
  }

  // ── Tier 1 persona-mode injection ──────────────────────────────────
  // If this resolved to `updateBranding` via a persona-mode directive, merge
  // `aiPersona.personaMode` into the payload (preserving any existing
  // aiPersona subkeys) so `useZeederVoice` can route it to `UPDATE_PERSONA`.
  let responsePayload = payloadOverrides;
  if (resolvedActionId === 'updateBranding') {
    const detectedPersonaMode = extractPersonaMode(text);
    if (detectedPersonaMode) {
      responsePayload = {
        ...payloadOverrides,
        aiPersona: {
          ...(payloadOverrides.aiPersona as Record<string, unknown> | undefined),
          personaMode: detectedPersonaMode,
        },
      };
    }
  }

  if (resolvedActionId === 'navigate') {
    const dashboardAlias = /\b(dashboard|main\s+page|overview|home|main\s+dashboard)\b/i.test(text.trim());
    if (dashboardAlias) {
      responsePayload = { ...payloadOverrides, href: '/client/dashboard' };
    }
  }

  const data: ClientCommandResponse = {
    success: true,
    actionType: systemType,
    targetIds: [],
    payload: responsePayload,
    summary:
      systemType === 'SYSTEM_NAVIGATE' && responsePayload.href
        ? PAGE_WELCOME_GREETINGS[responsePayload.href as string] ?? `Navigating to ${responsePayload.href as string}.`
        : `Parsed intent: ${systemType}`,
  };
  const response = NextResponse.json(data);
  await tryPersistCommand(data, systemType, responsePayload);
  return response;
}

// ──────────────────────────── Semantic Fallback ──────────────────────────

/**
 * Server-authoritatively resolve the current tenant's live branding/config row
 * by the resolved `tenantId`. Used to hydrate the LLM system prompt so the AI
 * concierge has situational memory of the host business identity and active
 * tenant settings. Failures degrade to `null` (the builder falls back to safe
 * defaults) so the command pipeline is never blocked by a branding read.
 */
async function fetchTenantDetails(
  supabase: SupabaseClient | null,
  tenantId: string | null,
): Promise<Record<string, unknown> | null> {
  if (!supabase || !tenantId) return null;
  try {
    const { data, error } = await supabase
      .from('tenants')
      .select('id, tenant_id, name, branding_colors, system_prompt, preferred_voice, pricing_tier_key, show_ovg_branding, widget_config')
      .eq('id', tenantId)
      .maybeSingle();
    if (error || !data) return null;
    return data as Record<string, unknown>;
  } catch (err) {
    console.error('[process-command] tenant detail fetch error:', err);
    return null;
  }
}

/**
 * Tier 2 conversational fallback, invoked only when Tier 1 deterministic
 * parsing fails to resolve an intent.
 *
 * Calls a fast, client-scoped Groq completion with the "Pivot & Pull" system
 * prompt and returns its conversational reply. The LLM's `actionType` is
 * whitelisted to the two client-safe dispatchable intents; anything else is
 * collapsed to `CLIENT_NOP` so the view never shifts off-surface. Malformed
 * JSON, a missing API key, or any transport error degrades gracefully to the
 * same deterministic CLIENT_NOP response the Tier 1 pass would have produced.
 */
interface PersistContext {
  clientMemories?: Record<string, string>;
  supabase: SupabaseClient;
  tenantId: string | null;
  userId: string | null;
  testMode: boolean;
  isAnon: boolean;
  bookingIntent?: boolean;
  definitionQuery?: boolean;
}

async function runSemanticFallback(
  text: string,
  _currentPath: string = '',
  previewDraft: PreviewDraft = {},
  persistCtx?: PersistContext,
): Promise<NextResponse<ClientCommandResponse>> {
  const isAnon = persistCtx?.isAnon ?? false;
  const bookingIntent = persistCtx?.bookingIntent ?? false;
  const _definitionQuery = persistCtx?.definitionQuery ?? false;
  const availableCommands = buildClientCapabilities();
  const capabilityPayload: Record<string, unknown> = { availableCommands, brandingCapabilities: {} };

  // ── Relational memory ──────────────────────────────────────────────────
  // Authenticated users: keyed by userId from client_memories.
  // Anonymous visitors: keyed by self-reported contact detail from
  // tenant_appointments + visitor_memories. Lookup is silent — the AI gets
  // context without announcing "I remember you."
  const memories: ClientMemoryMap = {};
  let anonIdentityType: VisitorIdentityType | null = null;
  let anonIdentityValue: string | null = null;

  if (!isAnon) {
    const mem = await getClientMemories(persistCtx?.tenantId ?? null, persistCtx?.userId ?? null);
    Object.assign(memories, mem);
  } else if (persistCtx?.tenantId) {
    const booking = buildBookingCapture({}, text, null);
    if (booking.hasContact) {
      const phone = normalizeVisitorPhone(booking.phone);
      const email = normalizeVisitorEmail(null);

      if (phone) {
        anonIdentityType = 'phone';
        anonIdentityValue = phone;

        const { data: appointment } = await supabaseAdmin
          .from('tenant_appointments')
          .select('client_name')
          .eq('tenant_id', persistCtx.tenantId)
          .eq('client_phone', phone)
          .eq('status', 'LEAD')
          .maybeSingle();

        if (appointment?.client_name) {
          memories.client_name = appointment.client_name;
        }

        const visitorMems = await getVisitorMemories(persistCtx.tenantId, 'phone', phone);
        Object.assign(memories, visitorMems);
      } else if (email) {
        anonIdentityType = 'email';
        anonIdentityValue = email;

        const visitorMems = await getVisitorMemories(persistCtx.tenantId, 'email', email);
        Object.assign(memories, visitorMems);
      }

      if (booking.firstName && !memories.client_name) {
        memories.client_name = booking.firstName;
      }
    }
  }

  if (persistCtx?.clientMemories && typeof persistCtx.clientMemories === "object") {
    Object.assign(memories, persistCtx?.clientMemories);
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    const data: ClientCommandResponse = {
      success: true,
      actionType: 'CLIENT_NOP',
      targetIds: [],
      payload: capabilityPayload,
      summary: "I didn't catch a command I can run in your client portal.",
    };
    if (persistCtx) {
      await tryPersistCommandInCtx(persistCtx, text, data, 'CLIENT_NOP', {});
    }
    if (!isAnon) {
      void extractAndStoreMemories(persistCtx?.tenantId ?? null, persistCtx?.userId ?? null, text);
    } else if (anonIdentityType && anonIdentityValue) {
      void extractAndStoreVisitorMemories(persistCtx?.tenantId ?? null, anonIdentityType, anonIdentityValue, text);
    }
    return NextResponse.json(data);
  }

  try {
    const groq = new Groq({ apiKey });

    // Anonymous callers cannot read `tenants` via RLS, so hydrate with the
    // admin client; authenticated callers use their own session client.
    const tenantClient = isAnon ? supabaseAdmin : (persistCtx?.supabase ?? null);
    const tenantDetails = await fetchTenantDetails(tenantClient, persistCtx?.tenantId ?? null);

    // ── KB-RAG-TRACE: incoming tenant identity ──────────────────────────
    console.log('[KB-RAG-TRACE] incoming tenantId:', persistCtx?.tenantId ?? null, 'isAnon:', isAnon, 'query:', text);

    // ── Knowledge Base context fetch ─────────────────────────────────────
    // Pull active tenant_knowledge entries so the public widget can reference
    // custom products/services instead of only the hardcoded template catalog.
    let knowledgeEntries: KnowledgeEntry[] = [];
    if (persistCtx?.tenantId && tenantClient) {
      const { data: kbData, error: kbError } = await tenantClient
        .from('tenant_knowledge')
        .select('title, content, category')
        .eq('tenant_id', persistCtx.tenantId)
        .eq('is_active', true)
        .order('created_at', { ascending: true });

      // ── KB-RAG-TRACE: exact KB query + raw results ────────────────────
      console.log('[KB-RAG-TRACE] KB query tenant_id:', persistCtx.tenantId, 'error:', kbError?.message ?? null, 'results:', kbData ?? []);

      if (!kbError && Array.isArray(kbData)) {
        // Deduplicate by title & content snippet to prevent product repetition.
        const seen = new Set<string>();
        knowledgeEntries = kbData
          .map((row: Record<string, unknown>) => ({
            title: typeof row.title === 'string' ? row.title : '',
            content: typeof row.content === 'string' ? row.content : '',
            category: typeof row.category === 'string' ? row.category : null,
          }))
          .filter((entry) => {
            const key = `${entry.title.trim().toLowerCase()}:${entry.content.trim().slice(0, 50).toLowerCase()}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
        console.log('[KB-RAG-TRACE] KB entries after dedup:', knowledgeEntries.map(e => ({ title: e.title, contentLen: e.content.length, category: e.category })));
      }
    }

    const hydratedSystemPrompt = buildSystemPrompt(
      tenantDetails,
      {
        vibe: previewDraft.vibe,
        persona: previewDraft.persona,
        businessName: previewDraft.brandName,
      },
      memories,
      isAnon ? 'public' : 'client',
      knowledgeEntries,
    );

    // ── Log system prompt for debugging ─────────────────────────────────
    console.log('[KB-RAG-TRACE] System prompt length:', hydratedSystemPrompt.length, 'KB entries:', knowledgeEntries.length);
    
    // Check if KB section is actually in the prompt
    const kbSectionFound = hydratedSystemPrompt.includes('=== CUSTOM PRODUCT & SERVICE CATALOG ===');
    console.log('[KB-RAG-TRACE] KB section in prompt?', kbSectionFound);
    if (kbSectionFound) {
      const kbStart = hydratedSystemPrompt.indexOf('=== CUSTOM PRODUCT & SERVICE CATALOG ===');
      const kbEnd = hydratedSystemPrompt.indexOf('===', kbStart + 50);
      const kbSection = hydratedSystemPrompt.substring(kbStart, kbEnd > 0 ? Math.min(kbEnd, kbStart + 600) : kbStart + 600);
      console.log('[KB-RAG-TRACE] KB section content:', kbSection);
    }

    // ── Dynamic integration tool injection ──────────────────────────
    // Read the client's saved `widget_config.integrations` and expose only the
    // tools whose integration is active & configured. This makes the model
    // aware of the tenant's real capability set without any client-supplied
    // flag. The resolved tools are rendered into the system prompt below.
    // SKIPPED for anon: a public embed must never be able to trigger a tenant
    // integration connector.
    const widgets =
      (tenantDetails?.widget_config as Record<string, unknown> | null | undefined) ?? null;
    const integrations =
      widgets && typeof widgets === 'object'
        ? (widgets.integrations as Record<string, Record<string, unknown>> | undefined)
        : undefined;
    const activeTools = isAnon ? [] : resolveActiveTools(integrations);
    const toolsPrompt = isAnon ? '' : buildIntegrationToolsPrompt(activeTools);
    const JSON_RESPONSE_DIRECTIVE = [
      '',
      '=== RESPONSE FORMAT (STRICT) ===',
      'You MUST respond with a SINGLE valid JSON object and nothing else — no markdown, no code fences, no prose outside the JSON.',
      `Allowed "actionType" values: ${[...allowedActions(isAnon)].join(' | ')} (use "CLIENT_NOP" for normal conversational replies).`,
      '  - "summary": the plain-text reply shown to the user.',
      '  - "payload": for bookings, include { "firstName": string|null, "phone": string|null, "treatment": string|null, "preferredDate": string|null, "preferredTime": string|null, "notes": string|null }.',
      'Example: { "actionType": "CLIENT_NOP", "summary": "Hi! How can I help you today?" }',
    ].join('\n');

    const enrichedSystemPrompt = toolsPrompt
      ? `${hydratedSystemPrompt}\n${toolsPrompt}${JSON_RESPONSE_DIRECTIVE}`
      : `${hydratedSystemPrompt}${JSON_RESPONSE_DIRECTIVE}`;

    const completion = await groq.chat.completions.create({
      model: 'openai/gpt-oss-120b',
      temperature: 0.7,
      max_tokens: 300,
      response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: enrichedSystemPrompt },
          { role: 'user', content: text },
        ],
    });

    const content = completion.choices[0]?.message?.content;
    console.log('[KB-RAG-TRACE] Groq call completed. Response status:', completion.usage?.prompt_tokens, 'output tokens:', completion.usage?.completion_tokens);
    console.log('[KB-RAG-TRACE] LLM raw response:', content?.substring(0, 300));
    console.log('[KB-RAG-TRACE] Query was:', text, '| KB entries available:', knowledgeEntries.map(e => e.title).join(', '));
    let llmParsed: { actionType?: string; summary?: string; payload?: unknown } = {};
    if (content) {
      try {
        const maybe = JSON.parse(content);
        if (maybe && typeof maybe === 'object' && !Array.isArray(maybe)) {
          llmParsed = maybe as { actionType?: string; summary?: string; payload?: unknown };
        }
      } catch {
        llmParsed = {};
      }
    }

    const rawAction = (llmParsed.actionType ?? 'CLIENT_NOP').toString().toUpperCase();
    // When the request was routed as a booking intent, FORCE the booking action
    // type so capture is deterministic — the model may not emit the exact
    // SYSTEM_BOOKING_CAPTURE label, but we still extract its structured payload.
    const actionType = bookingIntent
      ? 'SYSTEM_BOOKING_CAPTURE'
      : allowedActions(isAnon).has(rawAction)
        ? rawAction
        : 'CLIENT_NOP';

    console.log('[KB-RAG-TRACE] LLM parsed actionType:', llmParsed.actionType, '| Final actionType:', actionType, '| Summary:', llmParsed.summary?.substring(0, 100));

    const detectedPersonaMode = extractPersonaMode(text);
    let responsePayload = capabilityPayload;
    if (actionType === 'SYSTEM_UPDATE_BRANDING' && detectedPersonaMode) {
      responsePayload = {
        ...capabilityPayload,
        aiPersona: {
          ...(capabilityPayload.aiPersona as Record<string, unknown> | undefined),
          personaMode: detectedPersonaMode,
        },
      };
    }

    // ── Booking capture (allowed for anon + authed) ─────────────────
    // Sanitize the LLM-extracted payload (untrusted model output) and persist a
    // lead row to tenant_appointments when a contact detail is present.
    if (actionType === 'SYSTEM_BOOKING_CAPTURE') {
      const booking = buildBookingCapture(llmParsed.payload ?? {}, text, llmParsed.summary ?? null);
      if (booking && booking.hasContact && persistCtx?.tenantId) {
        try {
          await supabaseAdmin.from('tenant_appointments').insert({
            tenant_id: persistCtx.tenantId,
            client_name: booking.firstName,
            client_phone: booking.phone,
            status: 'LEAD',
            start_time: new Date().toISOString(),
            end_time: new Date().toISOString(),
          });
        } catch (err) {
          console.error('[process-command] Booking capture insert error:', err);
        }
        responsePayload = {
          firstName: booking.firstName,
          phone: booking.phone,
          treatment: booking.treatment,
          preferredDate: booking.preferredDate,
          preferredTime: booking.preferredTime,
          notes: booking.notes,
        };
      } else {
        // No usable contact -> treat as a normal conversational reply.
        return corsJson({
          success: true,
          actionType: 'CLIENT_NOP',
          targetIds: [],
          payload: {},
          summary:
            'Happy to help you book! Could you share your name and a phone number so we can confirm?',
        });
      }
    }

    // ── Integration tool execution ──────────────────────────────────
    // BLOCKED for anon (see activeTools=[] above). For authed callers, execute
    // only allowed tenant tools and fold the confirmation into the summary.
    const functionCall = parseFunctionCall(llmParsed as Record<string, unknown>);
    let toolResultMessage: string | null = null;
    if (functionCall && !isAnon && INTEGRATION_TOOL_BY_NAME[functionCall.name]) {
      const isAllowed = activeTools.some((t) => t.name === functionCall.name);
      if (isAllowed) {
        const result = executeIntegrationTool(functionCall);
        toolResultMessage = result.message;
        responsePayload = {
          ...responsePayload,
          toolCall: { name: functionCall.name, ok: result.ok, detail: result.detail ?? {} },
        };
      }
    }

    // Forward LLM payload for structured client voice actions so executors
    // receive the extracted fields (assistantName, content, confirm, etc.).
    if (
      actionType === 'SYSTEM_UPDATE_PERSONA' ||
      actionType === 'SYSTEM_MANAGE_MEMORY' ||
      actionType === 'SYSTEM_PUBLISH_DRAFT'
    ) {
      responsePayload = { ...(llmParsed.payload as Record<string, unknown> ?? {}) };
    }

    const summary =
      toolResultMessage ??
      (llmParsed.summary?.toString().trim() ||
        "I didn't quite catch that. What can I help you configure in your portal today?");

    const data: ClientCommandResponse = {
      success: true,
      actionType,
      targetIds: [],
      payload: responsePayload,
      summary,
    };
    if (persistCtx) {
      await tryPersistCommandInCtx(persistCtx, text, data, actionType, responsePayload);
    }
    // Fire-and-forget: learn new facts from this turn without blocking the
    // response. Memory extraction failures are non-fatal.
    if (!isAnon) {
      void extractAndStoreMemories(persistCtx?.tenantId ?? null, persistCtx?.userId ?? null, text);
    } else if (anonIdentityType && anonIdentityValue) {
      void extractAndStoreVisitorMemories(persistCtx?.tenantId ?? null, anonIdentityType, anonIdentityValue, text);
      void touchVisitorMemory(persistCtx?.tenantId ?? null, anonIdentityType, anonIdentityValue);
    }
    return NextResponse.json(data);
  } catch (err) {
    console.error('[process-command] Semantic fallback catch triggered:', {
      error: err instanceof Error ? err.message : JSON.stringify(err),
      stack: err instanceof Error ? err.stack : undefined,
      hasApiKey: Boolean(process.env.GROQ_API_KEY),
      text,
    });
    // Resilient fallback: if the LLM is unreachable we still answer
    // informational add-on questions from the static catalog so the user
    // never hears a generic snag for "What is smart booking?".
    const localAnswer = buildLocalAddonAnswer(text);
    const fallbackSummary = isAnon
      ? "I'm here to help — you can book, reschedule, or ask me about our services."
      : "I'm here to help, though I hit a slight snag processing that. Would you like to update your branding or check your telemetry signals?";
    const summary = localAnswer ?? fallbackSummary;
    const data: ClientCommandResponse = {
      success: true,
      actionType: 'CLIENT_NOP',
      targetIds: [],
      payload: capabilityPayload,
      summary,
    };
    if (persistCtx) {
      await tryPersistCommandInCtx(persistCtx, text, data, 'CLIENT_NOP', {});
    }
    return NextResponse.json(data);
  }
}

async function tryPersistCommandInCtx(
  ctx: PersistContext,
  text: string,
  response: ClientCommandResponse,
  actionType: string,
  payload: Record<string, unknown>,
): Promise<void> {
  // Anonymous callers persist nothing (no session/userId, no tenant mutation).
  if (ctx.testMode || ctx.isAnon) return;
  try {
    await persistChatMessage(ctx.supabase, ctx.tenantId, ctx.userId!, text, {
      actionType: response.actionType,
      summary: response.summary,
    });
    if (!['CLIENT_NOP', 'SYSTEM_HELP'].includes(actionType)) {
      await logPlatformAction({
        supabase: ctx.supabase,
        tenantId: ctx.tenantId,
        userId: ctx.userId!,
        actionId: actionType,
        params: payload,
        result: response.payload,
        surface: 'client',
      });
    }
  } catch (err) {
    console.error('[process-command] Persistence error:', err);
  }
}

// ──────────────────────────── Unsupported Methods ───────────────────────

// CORS preflight for the public, cross-origin widget embed.
export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}

export async function PUT(): Promise<NextResponse> {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}

export async function DELETE(): Promise<NextResponse> {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}
