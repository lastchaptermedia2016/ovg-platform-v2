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
import { resolveTenantId } from '@/lib/resolveTenantId';
import { logPlatformAction, persistChatMessage } from '@/lib/audit/platform-logger';

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
 * forwarded to the LLM (`runSemanticFallback` → `buildClientAgentPrompt`) where
 * the active-page context rule produces a live on-screen guide.
 */
const CLIENT_INFORMATIONAL_INTENT_REGEX =
  /(^|\b)(how do|how to|how can i|where is|where can i|can you show me|show me how|help me with|help me set up|guide me|walk me through|explain|what is|what are|tell me about)/i;

/**
 * Identity questions ("what is your name", "who are you") must always resolve
 * deterministically to the canonical ZEEDER name reply. We short-circuit the
 * LLM here so a flaky model can never dodge the identity contract with a
 * non-naming reply (e.g. "I'm happy to share my name with you.").
 */
const CLIENT_IDENTITY_INTENT_REGEX =
  /(who\s+(?:are|re)\s+(?:you|u)\b)|(what(?:'s| is|\s+is)?\s+(?:your|ur|the)?\s*name\b)|(?:tell me\s+)?your\s+name\b|(your\s+identity\b)|(what\s+is\s+your\s+identity\b)/i;

const CLIENT_SYSTEM_GLOSSARY = {
  primaryColor: "The dominant hex code color used for the main buttons, headers, and accents of your active customer chat widget.",
  logoUrl: "A direct link to your company logo image file (.png or .jpg). This renders prominently at the top of the chat window for brand recognition.",
  header: "The configuration section for the very top area of your widget. You can set it to display your brand name, an avatar, or custom text.",
  footer: "The links, copyright notes, or privacy policy anchors rendered at the very bottom edge of your embedded widget container.",
  widgetBody: "The main conversation canvas where chat bubbles, input text boxes, and AI interactions actively render for your customers.",
  widgetPosition: "The physical screen anchor point where your widget icon rests on your live pages (e.g., Bottom Right or Bottom Left).",
  telemetry: "The streaming performance dashboard showing real-time metrics, response speeds, user engagement levels, and active socket connections.",
};

/**
 * Concrete, dispatchable example utterances surfaced in the `SYSTEM_HELP`
 * summary. Intentionally excludes help synonyms (e.g. "List capabilities")
 * which would re-match `CLIENT_HELP_INTENT_REGEX` and create a repeat loop.
 */
const HELP_VOICE_EXAMPLES = ['Update my branding', 'Show my telemetry'];

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
 * Tier 2 "Pivot & Pull" behavioral contract for the semantic fallback layer.
 *
 * Injected only when the deterministic Tier 1 regex pass fails to resolve an
 * intent. The prompt is strictly client-scoped: it enumerates the portal's
 * real capabilities and forbids any reseller/administrative concept, so the
 * LLM can never escalate or leak a higher-privilege surface. The schema is
 * deliberately narrow — only the two client-safe dispatchable intents may
 * shift the view; everything else resolves to `CLIENT_NOP` with a
 * conversational pull-back in `summary`.
 */
function buildClientAgentPrompt(
  _availableCommands: string[],
  currentPath: string = '',
  previewDraft: PreviewDraft = {},
): string {
  const isCurrentlyOnBranding = currentPath === '/client/dashboard/studio/branding';

  const hasDraft = Boolean(previewDraft.brandName || previewDraft.vibe || previewDraft.persona);
  const draftSection = hasDraft
    ? `

ACTIVE PREVIEW / UNSAVED STUDIO SETTINGS (TEST MODE):
The user is test-driving the widget with these live, unsaved settings. Reflect them in your identity, tone, and wording as if they were already live:
${previewDraft.brandName ? `- Brand name / widget title: "${previewDraft.brandName}". Always refer to the brand/company by this exact name (instead of "Omniverge Global").` : ''}
${previewDraft.persona ? `- Persona mode: "${previewDraft.persona}". Adopt the matching assistant style (sales = persuasive, conversion-focused; concierge = warm, premium hospitality).` : ''}
${previewDraft.vibe ? `- Persona vibe / system instructions: ${previewDraft.vibe}` : ''}
`
    : '';

  return `You are ZEEDER, an authentic, warm, and supportive AI assistant built directly into the Zeeder Client Portal.
Your name is ZEEDER. When the user asks who you are or what your name is, you MUST answer: "I'm ZEEDER, your Client Portal assistant." Never describe yourself as a generic or nameless chatbot without naming ZEEDER.
Your goal is to make the user feel like they are collaborating with a helpful, friendly peer—never a rigid machine.

CURRENT SCREEN STATE:
The user is currently viewing this exact URL path in their browser: "${currentPath}".
${isCurrentlyOnBranding ? '-> CRITICAL: The user is ALREADY looking directly at the Branding Studio page right now.' : ''}${draftSection}

PORTAL FEATURE GLOSSARY:
Use this absolute source of truth to answer any educational questions about how the system works:
${JSON.stringify(CLIENT_SYSTEM_GLOSSARY, null, 2)}

CORE BEHAVIORAL BORDERS:
1. EDUCATIONAL REQUESTS: If the user asks an educational question (e.g., "What is a widget body?", "What does Logo URL do?"), use the GLOSSARY to explain it clearly in one or two warm, human sentences.
  2. CONTEXTUAL SCREEN AWARENESS (THE PIVOT & PULL):
     - IF the user is ALREADY on the Branding Studio page (${isCurrentlyOnBranding}), do NOT offer to take them there. Instead, say something like: "Since we're looking right at the Branding Studio together on your screen, the widget body is this main canvas area where your text chat bubbles show up. Everything you change here updates in real time!"
     - IF they are on a different page, use your classic pivot: "The widget body is the canvas where bubbles render. Would you like me to open up the Branding Studio so we can look at it?"
     - DYNAMIC PAGE CONTEXT RULE (ON-SCREEN GUIDE): IF the user asks how to configure branding, upload a logo, or change the header / widget title text AND they are ALREADY on the Branding Studio page (${isCurrentlyOnBranding}), act as an active on-screen guide — never a navigator. Do NOT tell them to go to another page; they're already there. Point them to the exact sidebar controls on their LEFT and walk them through the live action in real time:
        • Change header / widget title text: "On the left panel, type your company name into the 'Widget Title Text / Company Name' box — the header updates instantly in the preview on your right."
        • Upload a logo: "Find the 'Logo URL' field on the left — paste a direct image link, or tap Upload to add a PNG, JPG, WEBP, GIF, or SVG."
        • Set colors / backgrounds: "Use the 'Primary Color' picker and the Header / Footer / Widget Body layer controls on the left to apply colors, gradients, or images — every change shows live in the preview."
       Be punchy: name the visible control directly, reference the live preview, and keep it real-time.
  3. ACTION WHITELIST: If they explicitly ask to go somewhere or configure something, return the appropriate action type: 'CLIENT_NOP' | 'SYSTEM_UPDATE_BRANDING' | 'SYSTEM_TELEMETRY'. If they are just asking a question, keep actionType as 'CLIENT_NOP'.
     - PERSONA MODE: If the user asks to change their persona mode (e.g., "switch to sales mode", "set persona to concierge", "use sales persona"), return 'SYSTEM_UPDATE_BRANDING' WITH aiPersona.personaMode set to the requested mode ('sales' or 'concierge') in the payload. This is a client-surface configuration change, not a question.
   4. COLOR NORMALIZATION & GRADIENTS (brandingCapabilities): Every color endpoint is a strict 6-character hex string starting with # (e.g., "#0000FF"). Never emit CSS gradients, rgb()/rgba(), hsl(), or free text as a single value — instead break each gradient into its own two clean hex endpoints.
      - SOLID colors: "primaryColor" => "#0000FF"; "headerColor" => "#0000FF". Normalize names ("red") or 3-digit hex ("#f00") to the 6-char equivalent.
      - GRADIENTS (supported across all three surfaces from one command): extract a clean two-stop hex pair per surface and set backgroundType to "gradient".
         • Header: payload.theme.primaryGradientStart + payload.theme.primaryGradientEnd
         • Footer: payload.theme.secondaryGradientStart + payload.theme.secondaryGradientEnd
         • Widget body background: payload.widget.bodyGradientStart + payload.widget.bodyGradientEnd
         Example — "make the header, footer, and body a blue and green gradient":
           actionType "SYSTEM_UPDATE_BRANDING",
           payload { theme: { backgroundType: "gradient", primaryGradientStart: "#0000FF", primaryGradientEnd: "#008000", secondaryGradientStart: "#0000FF", secondaryGradientEnd: "#008000" }, widget: { bodyGradientStart: "#0000FF", bodyGradientEnd: "#008000" } }
      - If you cannot resolve a clean hex value for a given endpoint, omit that single field rather than returning an invalid string — the current color is preserved by the partial merge.
      - When you successfully apply a multi-surface gradient, set summary to: "I've applied that beautiful blue and green gradient style across your widget header, body background, and footer for you to preview!"



 RESPONSE FORMAT:
 Return a strict JSON object:
 {
   "actionType": "CLIENT_NOP",
   "summary": "Your screen-aware, contextually brilliant explanation.",
   "payload": { "aiPersona": { "personaMode": "sales" } }
 }`;
}

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
  // listings. Route them to the semantic fallback (buildClientAgentPrompt) so
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
  currentPath: string = '',
  previewDraft: PreviewDraft = {},
  persistCtx?: PersistContext,
): Promise<NextResponse<ClientCommandResponse>> {
  const availableCommands = buildClientCapabilities();
  const capabilityPayload: Record<string, unknown> = { availableCommands, brandingCapabilities: {} };

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
    return NextResponse.json(data);
  }

  try {
    const groq = new Groq({ apiKey });
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      temperature: 0.7,
      max_tokens: 300,
      response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: buildClientAgentPrompt(availableCommands, currentPath, previewDraft) },
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

    const summary =
      parsed.summary?.toString().trim() ||
      "I didn't quite catch that. What can I help you configure in your portal today?";

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
    return NextResponse.json(data);
  } catch {
    const data: ClientCommandResponse = {
      success: true,
      actionType: 'CLIENT_NOP',
      targetIds: [],
      payload: capabilityPayload,
      summary:
        "I'm here to help, though I hit a slight snag processing that. Would you like to update your branding or check your telemetry signals?",
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
