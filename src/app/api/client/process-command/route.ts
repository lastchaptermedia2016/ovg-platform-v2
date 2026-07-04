/**
 * @file route.ts
 *
 * ZEEDER Client Process-Command API
 *
 * This endpoint is the sovereign voice-to-action bridge for the ZEEDER system.
 * It accepts natural-language text or an explicit action intent and returns a
 * validated `ZeeederActionDispatch` that the client-side `useZeederVoice` hook
 * can forward to `ZeederContext.dispatch()`.
 *
 * @remarks
 * This module is intentionally **zero-dependency** with respect to the
 * reseller domain. It does NOT reference:
 * - Reseller auth / slugs / UUID resolution
 * - `src/contexts/HannahContext`
 * - `src/lib/reseller/*`
 * - `src/hooks/use-voice-command`
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth/server';
import { z } from 'zod';
import { zeederActionRegistry, isZeederActionId, type ZeederActionId } from '@/lib/zeeder/action-registry';

// ──────────────────────────── Types & Schemas ───────────────────────────

/**
 * Incoming request shape for the ZEEDER process-command endpoint.
 */
export interface ZeederCommandRequest {
  /** Free-form text to interpret into a ZEEDER action (e.g. "update my branding"). */
  text: string;
  /** Already-resolved action ID — bypasses intent parsing for direct dispatch. */
  actionId?: ZeederActionId;
  /** Optional payload overrides forwarded to the action handler. */
  payload?: Record<string, unknown>;
}

/**
 * Outbound response shape returned to the client.
 */
export interface ZeederCommandResponse {
  /** Whether the command was successfully resolved to an action. */
  success: boolean;
  /** The resolved action identifier. */
  actionId: ZeederActionId | null;
  /** The payload to pass to `ZeederContext.dispatch()`. */
  payload: Record<string, unknown>;
  /** Human-readable summary for debugging / UI feedback. */
  summary: string;
  /** Human-readable error message if `success` is false. */
  error?: string;
}

// ──────────────────────────── Validation ────────────────────────────────

const CommandRequestSchema = z.object({
  text: z.string().min(1).max(2000),
  actionId: z.string().optional(),
  payload: z.record(z.unknown()).optional().default({}),
});

// ──────────────────────────── Intent Parsing ────────────────────────────

/**
 * Simple keyword-to-actionId mapping.
 *
 * Matches user utterances against known ZEEDER commands and returns the
 * corresponding action identifier along with any extracted payload values.
 *
 * @param text - The user's natural-language input.
 * @returns A dispatch descriptor or null if no action matches.
 */
function parseIntent(
  text: string,
): { actionId: ZeederActionId; payload: Record<string, unknown> } | null {
  const lower = text.toLowerCase().trim();

  // ── updateBranding ───────────────────────────────────────────────────
  if (
    /(update|change|set|apply)\s.*(brand|theme|color|logo|styl)/i.test(lower) ||
    /branding/i.test(lower)
  ) {
    return { actionId: 'updateBranding', payload: {} };
  }

  // ── toggleAgent ──────────────────────────────────────────────────────
  const agentMatch = /(enable|disable|toggle|activate|deactivate)\s+(agent|ai)\s*([\w-]+)?/i.exec(
    text,
  );
  if (agentMatch) {
    return {
      actionId: 'toggleAgent',
      payload: {
        agentId: agentMatch[3] || 'default',
        enabled: !/^dis|deact/i.test(agentMatch[1]),
      },
    };
  }

  // ── fetchTelemetry ───────────────────────────────────────────────────
  if (
    /(telemetry|metrics|health|status|performance|stats|signal)/i.test(lower)
  ) {
    const rangeMatch = /(1h|24h|7d|today|this week)/i.exec(lower);
    const range = rangeMatch ? rangeMatch[1] : '1h';
    // Normalise friendly ranges
    const normalizedRange = range === 'today' ? '1h' : range === 'this week' ? '7d' : range;
    return {
      actionId: 'fetchTelemetry',
      payload: {
        metric: 'system',
        range: normalizedRange,
      },
    };
  }

  return null;
}

// ──────────────────────────── Route Handler ─────────────────────────────

export const dynamic = 'force-dynamic';

/**
 * POST /api/client/process-command
 *
 * Accepts a ZEEDER voice command and resolves it to a dispatchable action.
 *
 * Body:
 * ```json
 * {
 *   "text": "update my branding",
 *   "actionId": "updateBranding",         // optional — bypasses parsing
 *   "payload": { "colors": { ... } }      // optional payload overrides
 * }
 * ```
 *
 * Response:
 * ```json
 * {
 *   "success": true,
 *   "actionId": "updateBranding",
 *   "payload": {},
 *   "summary": "Parsed intent: updateBranding"
 * }
 * ```
 */
export async function POST(request: NextRequest): Promise<NextResponse<ZeederCommandResponse>> {
  const { userId, error: authError } = await getAuthenticatedUser();
  if (authError || !userId) {
    return NextResponse.json({ success: false, actionId: null, payload: {}, summary: 'Unauthorized', error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // ── Parse & Validate ─────────────────────────────────────────────
    const body: unknown = await request.json();
    const validation = CommandRequestSchema.safeParse(body);

    if (!validation.success) {
      console.warn('[ZEEDER-VOICE] Invalid request body:', validation.error.flatten());
      return NextResponse.json(
        {
          success: false,
          actionId: null,
          payload: {},
          summary: 'Invalid request parameters.',
          error: validation.error.issues.map(i => i.message).join('; '),
        },
        { status: 400 },
      );
    }

    const { text, actionId: rawActionId, payload: payloadOverrides } = validation.data;

    // ── Resolve actionId ─────────────────────────────────────────────
    let resolvedActionId: ZeederActionId | null = null;

    // 1. If an explicit actionId was provided, validate it
    if (rawActionId) {
      if (isZeederActionId(rawActionId)) {
        resolvedActionId = rawActionId;
      } else {
        console.warn(`[ZEEDER-VOICE] Unknown actionId provided: "${rawActionId}"`);
        return NextResponse.json(
          {
            success: false,
            actionId: null,
            payload: {},
            summary: `Unknown action "${rawActionId}".`,
            error: `"${rawActionId}" is not a registered ZEEDER action.`,
          },
          { status: 400 },
        );
      }
    }

    // 2. Otherwise parse the text to infer intent
    if (!resolvedActionId) {
      const parsed = parseIntent(text);
      if (!parsed) {
        console.log(`[ZEEDER-VOICE] No action matched for text: "${text}"`);
        return NextResponse.json(
          {
            success: false,
            actionId: null,
            payload: {},
            summary: 'Could not determine the intended ZEEDER action from your input.',
            error: `No matching action for: "${text}"`,
          },
          { status: 422 },
        );
      }
      resolvedActionId = parsed.actionId;
      // Merge parsed payload with any explicit overrides (overrides win)
      payloadOverrides.agentId =
        (payloadOverrides.agentId as string | undefined) ?? (parsed.payload.agentId as string | undefined);
      payloadOverrides.range =
        (payloadOverrides.range as string | undefined) ?? (parsed.payload.range as string | undefined);
      payloadOverrides.metric =
        (payloadOverrides.metric as string | undefined) ?? (parsed.payload.metric as string | undefined);
      payloadOverrides.enabled =
        (payloadOverrides.enabled as boolean | undefined) ?? (parsed.payload.enabled as boolean | undefined);
    }

    // Confirm the action still exists in the registry
    const entry = zeederActionRegistry.get(resolvedActionId);
    if (!entry) {
      return NextResponse.json(
        {
          success: false,
          actionId: resolvedActionId,
          payload: {},
          summary: `Action "${resolvedActionId}" is not registered.`,
          error: `Registry missing entry for "${resolvedActionId}".`,
        },
        { status: 500 },
      );
    }

    console.log(
      `[ZEEDER-VOICE] Resolved action: "${resolvedActionId}" — ${entry.description}`,
    );

    return NextResponse.json({
      success: true,
      actionId: resolvedActionId,
      payload: payloadOverrides,
      summary: `Parsed intent: ${resolvedActionId}`,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unexpected server error.';
    console.error('[ZEEDER-VOICE] Unhandled error:', message);
    return NextResponse.json(
      {
        success: false,
        actionId: null,
        payload: {},
        summary: 'Internal server error.',
        error: message,
      },
      { status: 500 },
    );
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