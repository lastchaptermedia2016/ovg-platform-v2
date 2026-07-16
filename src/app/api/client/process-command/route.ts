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
import { z } from 'zod';
import { zeederActionRegistry, isZeederActionId, type ZeederActionId } from '@/lib/zeeder/action-registry';
import { CLIENT_SYSTEM_REGISTRY, type ClientSystemItem } from '@/lib/client-system-registry';
import { extractPersonaMode, hasPersonaModeIntent } from '@/lib/ai/extract-persona-mode';
import { buildSystemPrompt } from '@/lib/ai/system-prompt-builder';
import { getClientMemories, extractAndStoreMemories } from '@/lib/ai/memory-service';
import { resolveTenantId } from '@/lib/resolveTenantId';
import { logPlatformAction, persistChatMessage } from '@/lib/audit/platform-logger';
import {
  resolveActiveTools,
  INTEGRATION_TOOL_BY_NAME,
  FunctionCallSchema,
  type ToolDefinition,
} from '@/lib/ai/tools/integration-tools';
import { executeIntegrationTool } from '@/lib/ai/tools/integration-executors';

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
  /**
   * Sandbox flag raised by the Branding Studio preview widget. When true, the
   * request is a non-persistent "test drive": the route never writes to the
   * conversations / messages log tables (see `persistEnabled` in the handler).
   */
  testMode: z.boolean().optional().default(false),
  isTestDrive: z.boolean().optional().default(false),
  /**
   * Transient, unsaved brand overrides surfaced by the live Studio preview so
   * the AI can answer using the on-screen vibe/brand before the user saves.
   * These are merged over any saved profile when building the system prompt.
   */
  draftBrandName: z.string().optional(),
  draftVibe: z.string().optional(),
  draftPersona: z.string().optional(),
  context: z
    .object({
      clientProfileId: z.string().optional(),
      activeView: z.string().optional(),
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
 * through `ZeederContext`. Only the two client-safe intents are exposed;
 * `toggleAgent` has no SYSTEM_* counterpart and falls through to CLIENT_NOP.
 */
const ACTION_ID_TO_SYSTEM_TYPE: Record<string, string> = {
  updateBranding: 'SYSTEM_UPDATE_BRANDING',
  fetchTelemetry: 'SYSTEM_TELEMETRY',
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
 * Allowed action types the semantic fallback may surface. Anything outside this
 * whitelist is collapsed to `CLIENT_NOP` so the LLM cannot trigger an
 * unregistered or out-of-surface action.
 */
const SEMANTIC_FALLBACK_ALLOWED = new Set(['CLIENT_NOP', 'SYSTEM_UPDATE_BRANDING', 'SYSTEM_TELEMETRY']);

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
  // ── Server-authoritative auth gate ──────────────────────────────────
  // Derived from the session (unspoofable) — never a client-supplied flag.
  const { userId, error: authError } = await getAuthenticatedUser();
  if (authError || !userId) {
    return NextResponse.json(
      {
        success: false,
        actionType: 'CLIENT_NOP',
        targetIds: [],
        payload: {},
        summary: 'Unauthorized',
        error: 'Unauthorized',
      },
      { status: 401 },
    );
  }

  // ── Parse & Validate (Zod gates malformed bodies) ───────────────────
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json(
      {
        success: false,
        actionType: 'CLIENT_NOP',
        targetIds: [],
        payload: {},
        summary: 'Invalid request body.',
        error: 'Malformed JSON.',
      },
      { status: 400 },
    );
  }

  let parsed: z.infer<typeof CommandRequestSchema>;
  try {
    parsed = CommandRequestSchema.parse(raw);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Invalid request parameters.';
    return NextResponse.json(
      {
        success: false,
        actionType: 'CLIENT_NOP',
        targetIds: [],
        payload: {},
        summary: 'Invalid request parameters.',
        error: message,
      },
      { status: 400 },
    );
  }

  const {
    text,
    actionId: rawActionId,
    payload: payloadOverrides,
    currentPath,
    draftBrandName,
    draftVibe,
    draftPersona,
  } = parsed;

  const supabase = await createAuthClient();
  const { data: tenantId, error: _tenantError } = await resolveTenantId(userId, supabase);
  const testMode = parsed.testMode === true || parsed.isTestDrive === true;

  const previewDraft: PreviewDraft = {};
  if (draftBrandName) previewDraft.brandName = draftBrandName;
  if (draftVibe) previewDraft.vibe = draftVibe;
  if (draftPersona) previewDraft.persona = draftPersona;

  async function tryPersistCommand(
    response: ClientCommandResponse,
    actionType: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    if (testMode) return;
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

  // ── Pre-LLM help short-circuit (isolated client capabilities) ───────
  if (CLIENT_HELP_INTENT_REGEX.test(text.trim())) {
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
  // Pure navigation ("open the persona page", "take me to persona settings")
  // has no change verb and no concrete mode, so it must NOT fall through to the
  // LLM (which would collapse it to CLIENT_NOP). Resolve it deterministically —
  // the Persona viewport lives on the unified Studio dashboard alongside
  // Branding, so routing to SYSTEM_UPDATE_BRANDING is the correct, consistent
  // destination (mirrors how "branding" navigation resolves). Screen-aware:
  // if already on the Studio dashboard, just guide the user to the tab.
  if (CLIENT_PERSONA_NAV_INTENT_REGEX.test(text.trim())) {
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
  // The utterance asks to adjust the persona/AI mode but omits the concrete
  // target ("sales" | "concierge"). Resolve this deterministically (no LLM
  // round-trip) and route the user appropriately within the unified Studio
  // dashboard, where Branding and Persona are co-located sibling viewports.
  if (hasPersonaModeIntent(text)) {
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

  // ── Identity question → deterministic ZEEDER name response ─────────
  // "who are you" / "what is your name" resolve to the canonical identity reply
  // without any LLM round-trip, guaranteeing the assistant always names ZEEDER.
  if (CLIENT_IDENTITY_INTENT_REGEX.test(text.trim())) {
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

  // ── Informational / how-to queries → LLM (never the canned HELP block) ──
  // Questions like "how do I upload my logo" are educational, not capability
  // listings. Route them to the semantic fallback (runSemanticFallback) so
  // the agent returns a page-aware, step-by-step UI guide instead of the static
  // SYSTEM_HELP response. This must run after the identity check so "what is
  // your name" still resolves to the deterministic ZEEDER identity reply.
  if (CLIENT_INFORMATIONAL_INTENT_REGEX.test(text.trim())) {
    return runSemanticFallback(text, currentPath, previewDraft, {
      supabase,
      tenantId,
      userId,
      testMode,
    });
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

  const data: ClientCommandResponse = {
    success: true,
    actionType: systemType,
    targetIds: [],
    payload: responsePayload,
    summary: `Parsed intent: ${systemType}`,
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
  supabase: SupabaseClient;
  tenantId: string | null;
  userId: string;
  testMode: boolean;
}

async function runSemanticFallback(
  text: string,
  _currentPath: string = '',
  previewDraft: PreviewDraft = {},
  persistCtx?: PersistContext,
): Promise<NextResponse<ClientCommandResponse>> {
  const availableCommands = buildClientCapabilities();
  const capabilityPayload: Record<string, unknown> = { availableCommands, brandingCapabilities: {} };

  // Relational memory: recall who we are talking to from prior turns so the
  // hydrated system prompt can reference the client's name / business.
  const memories = await getClientMemories(persistCtx?.tenantId ?? null, persistCtx?.userId ?? null);

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    const data: ClientCommandResponse = {
      success: true,
      actionType: 'CLIENT_NOP',
      targetIds: [],
      payload: capabilityPayload,
      summary: 'I didn\'t catch a command I can run in your client portal.',
    };
    if (persistCtx) {
      await tryPersistCommandInCtx(persistCtx, text, data, 'CLIENT_NOP', {});
    }
    void extractAndStoreMemories(persistCtx?.tenantId ?? null, persistCtx?.userId ?? null, text);
    return NextResponse.json(data);
  }

  try {
    const groq = new Groq({ apiKey });

    // Server-authoritative tenant hydration: fetch the live tenant row by the
    // resolved tenantId and build an injection-safe system prompt that carries
    // the host business identity, brand styling, and active settings.
    const tenantDetails = await fetchTenantDetails(persistCtx?.supabase ?? null, persistCtx?.tenantId ?? null);
    const hydratedSystemPrompt = buildSystemPrompt(
      tenantDetails,
      {
        vibe: previewDraft.vibe,
        persona: previewDraft.persona,
        businessName: previewDraft.brandName,
      },
      memories,
    );

    // ── Dynamic integration tool injection ──────────────────────────
    // Read the client's saved `widget_config.integrations` and expose only the
    // tools whose integration is active & configured. This makes the model
    // aware of the tenant's real capability set without any client-supplied
    // flag. The resolved tools are rendered into the system prompt below.
    const widgets =
      (tenantDetails?.widget_config as Record<string, unknown> | null | undefined) ?? null;
    const integrations =
      widgets && typeof widgets === 'object'
        ? (widgets.integrations as Record<string, Record<string, unknown>> | undefined)
        : undefined;
    const activeTools = resolveActiveTools(integrations);
    const toolsPrompt = buildIntegrationToolsPrompt(activeTools);
    const enrichedSystemPrompt = toolsPrompt
      ? `${hydratedSystemPrompt}\n${toolsPrompt}`
      : hydratedSystemPrompt;

    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      temperature: 0.7,
      max_tokens: 300,
      response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: enrichedSystemPrompt },
          { role: 'user', content: text },
        ],
    });

    const content = completion.choices[0]?.message?.content;
    let parsed: { actionType?: string; summary?: string } = {};
    if (content) {
      try {
        parsed = JSON.parse(content);
      } catch {
        parsed = {};
      }
    }

    const rawAction = (parsed.actionType ?? 'CLIENT_NOP').toString().toUpperCase();
    const actionType = SEMANTIC_FALLBACK_ALLOWED.has(rawAction) ? rawAction : 'CLIENT_NOP';

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

    // ── Integration tool execution ──────────────────────────────────
    // If the LLM emitted a `functionCall` for a tool this tenant is allowed to
    // use, execute the (mock) handler and fold the confirmation into the
    // summary. Unknown/disabled tools are ignored so the pipeline stays safe.
    const functionCall = parseFunctionCall(parsed as Record<string, unknown>);
    let toolResultMessage: string | null = null;
    if (functionCall && INTEGRATION_TOOL_BY_NAME[functionCall.name]) {
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

    const summary =
      toolResultMessage ??
      (parsed.summary?.toString().trim() ||
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
    void extractAndStoreMemories(persistCtx?.tenantId ?? null, persistCtx?.userId ?? null, text);
    return NextResponse.json(data);
  } catch {
    // Resilient fallback: if the LLM is unreachable we still answer
    // informational add-on questions from the static catalog so the user
    // never hears a generic snag for "What is smart booking?".
    const localAnswer = buildLocalAddonAnswer(text);
    const summary =
      localAnswer ??
      "I'm here to help, though I hit a slight snag processing that. Would you like to update your branding or check your telemetry signals?";
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
  if (ctx.testMode) return;
  try {
    await persistChatMessage(ctx.supabase, ctx.tenantId, ctx.userId, text, {
      actionType: response.actionType,
      summary: response.summary,
    });
    if (!['CLIENT_NOP', 'SYSTEM_HELP'].includes(actionType)) {
      await logPlatformAction({
        supabase: ctx.supabase,
        tenantId: ctx.tenantId,
        userId: ctx.userId,
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

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}

export async function PUT(): Promise<NextResponse> {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}

export async function DELETE(): Promise<NextResponse> {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}
