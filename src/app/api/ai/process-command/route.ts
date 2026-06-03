import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';
import { z } from 'zod';
import { createClient as createSupabaseClient } from '@/lib/supabase/server';
import { resolveResellerId } from '@/lib/db/resolve-reseller';
import { buildDeploymentOfficerPrompt } from '@/core/ai/system-prompts';
import { buildCapabilitiesSummary, type StudioCapabilitiesMap } from '@/core/ai/studio-capabilities';

// Force dynamic to prevent build-time initialization
export const dynamic = 'force-dynamic';

// Request validation schema - resellerId is the slug string, not a UUID
// UUID resolution is handled by resolveResellerId
const ProcessCommandSchema = z.object({
  resellerId: z.string().min(1), // Reseller slug (e.g. "lastchaptermedia2016")
  userCommand: z.string().min(1).max(2000),
  currentConfig: z.record(z.any()).default({}),
  contextCapabilities: z.record(z.object({
    key: z.string().optional(),
    description: z.string(),
    examples: z.array(z.string()),
  })).optional(), // Studio capabilities from the /branding frontend
  tenantContext: z.object({
    tenantId: z.string().uuid().optional(), // Optional for global commands
    category: z.string().optional(),
  }),
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
type ProcessCommandRequest = z.infer<typeof ProcessCommandSchema>;

// Structured payload contract — replaces opaque z.record(z.any())
// Ensures the orchestrator returns predictable shapes the frontend can consume
const StructuredPayloadSchema = z.object({
  theme: z.object({
    primary: z.string().optional(),
    secondary: z.string().optional(),
    backgroundType: z.enum(['solid', 'gradient']).optional(),
    primaryGradientStart: z.string().optional(),
    primaryGradientEnd: z.string().optional(),
    secondaryGradientStart: z.string().optional(),
    secondaryGradientEnd: z.string().optional(),
    opacity: z.number().min(0).max(1).optional(),
    logoUrl: z.string().optional(),
  }).optional(),
  ui: z.object({
    aiInsightBadge: z.boolean().optional(),
    aiDesignMirror: z.boolean().optional(),
    customCss: z.boolean().optional(),
    badgeStyle: z.string().optional(),
    animation: z.string().optional(),
  }).optional(),
  behavior: z.object({
    prompt: z.string().optional(),
    tone: z.string().optional(),
  }).optional(),
  category_filter: z.string().optional(),
}).passthrough(); // Allow additional unknown keys for forward-compatibility

// Response schema for AI output - supports SINGLE, BULK, NO_MATCH, and SYSTEM_ macro commands
// SYSTEM_BULK_CONFIRM / SYSTEM_BULK_CANCEL / SYSTEM_FILTER_GRID are structural payloads
// that bypass database writes (see short-circuit guard in POST handler).
const AIResponseSchema = z.object({
  actionType: z.enum(['SINGLE', 'BULK', 'NO_MATCH', 'DELETE_CLIENT', 'SYSTEM_BULK_CONFIRM', 'SYSTEM_BULK_CANCEL', 'SYSTEM_FILTER_GRID', 'SYSTEM_UPDATE_BRANDING', 'SYSTEM_HELP', 'SYSTEM_NOTE', 'SYSTEM_DISARM', 'SYSTEM_EXPLAIN']),
  targetIds: z.array(z.string().uuid()).optional(),
  clientName: z.string().optional(),
  contextKey: z.string().optional(), // Relevant capability key for SYSTEM_EXPLAIN
  payload: StructuredPayloadSchema.optional().default({}),
  summary: z.string().min(3).max(500), // For TTS confirmation
  confidenceScore: z.number().min(0).max(1).optional().default(0.9),
});

// Pre-LLM intent detection regex for "what can you do" patterns
// Matches the SYSTEM_HELP macro command dictionary entries
const HELP_INTENT_REGEX = /^(what can you do|help|list commands|what are my options|capabilities|commands|what commands|show commands|show help|what can i do|how does this work|what are the commands)/i;

/**
 * Levenshtein distance — counts single-character edits (insert, delete, substitute).
 * Used to handle STT phonetic substitutions like "Zita" -> "Zeta".
 */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

/**
 * Fuzzy, case-insensitive tenant name matcher.
 * Strategy (in priority order):
 * 1. Exact substring match
 * 2. Whitespace-collapsed match — handles run-ons like "ZetaSky" -> "Zeta Sky"
 * 3. Token match — all words in search term appear in tenant name
 * 4. Edit-distance match — tolerance of 2 edits per token, handles phonetic
 *    substitutions like "Zita AI" -> "Zeta AI"
 */
function fuzzyMatchTenant(
  tenants: { id: string; name: string }[],
  searchTerm: string
): { id: string; name: string } | null {
  const normalized = searchTerm.toLowerCase().trim();
  if (!normalized) return null;

  // 1. Direct substring
  const direct = tenants.find(t => t.name.toLowerCase().includes(normalized));
  if (direct) return direct;

  // 2. Whitespace-collapsed
  const collapsed = normalized.replace(/\s+/g, '');
  const collapsedMatch = tenants.find(t => t.name.toLowerCase().replace(/\s+/g, '').includes(collapsed));
  if (collapsedMatch) return collapsedMatch;

  // 3. Token match
  const tokens = normalized.split(/\s+/).filter(Boolean);
  if (tokens.length > 1) {
    const tokenMatch = tenants.find(t => {
      const tenantLower = t.name.toLowerCase();
      return tokens.every(token => tenantLower.includes(token));
    });
    if (tokenMatch) return tokenMatch;
  }

  // 4. Edit-distance match — sum of best-match distances across all search tokens
  const EDIT_TOLERANCE = 2;
  let bestTenant: { id: string; name: string } | null = null;
  let bestScore = Infinity;
  const searchTokens = tokens.length ? tokens : [normalized];

  for (const tenant of tenants) {
    const tenantTokens = tenant.name.toLowerCase().split(/\s+/).filter(Boolean);
    let totalScore = 0;
    for (const st of searchTokens) {
      totalScore += Math.min(...tenantTokens.map(tt => levenshtein(st, tt)));
    }
    if (totalScore < bestScore && totalScore <= EDIT_TOLERANCE * searchTokens.length) {
      bestScore = totalScore;
      bestTenant = tenant;
    }
  }

  return bestTenant;
}

export async function POST(request: NextRequest) {
  // Initialize Groq client inside handler for production excellence
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.error('%c[ProcessCommand] ❌ GROQ_API_KEY not configured on server', 'color: #dc2626; font-weight: bold;');
    return NextResponse.json(
      { error: 'AI service not configured' },
      { status: 500 }
    );
  }

  const groq = new Groq({ apiKey });
  try {
    // Parse and validate request body
    const body = await request.json();
    const validationResult = ProcessCommandSchema.safeParse(body);

    if (!validationResult.success) {
      console.error('%c[ProcessCommand] ❌ Zod validation error:', 'color: #dc2626; font-weight: bold;', validationResult.error.flatten());
      console.error('%c[ProcessCommand] 🔷 Request body:', 'color: #0097b2; font-weight: bold;', body);
      return NextResponse.json(
        { error: 'Invalid request parameters', details: validationResult.error.flatten() },
        { status: 400 }
      );
    }

    const { resellerId, userCommand, currentConfig, tenantContext, contextCapabilities } = validationResult.data;

    // Security: Validate reseller authorization
    if (!resellerId) {
      return NextResponse.json(
        { error: 'Unauthorized: Reseller ID required' },
        { status: 403 }
      );
    }

    // Initialize Supabase for potential global command lookup
    const supabase = await createSupabaseClient();
    let allTenants: { id: string; name: string; category: string }[] = [];

    console.log('%c[ProcessCommand] 🔷 Fetching tenants for reseller:', 'color: #0097b2; font-weight: bold;', resellerId);

    // 🔷 Production Excellence: Resolve reseller_slug to UUID via shared utility
    // resolveResellerId queries slug first (text column), then falls back to tenant_id (UUID column)
    const actualResellerId = await resolveResellerId(supabase, resellerId);

    if (!actualResellerId) {
      console.error('%c[ProcessCommand] ❌ Failed to resolve reseller slug:', 'color: #dc2626; font-weight: bold;', {
        slug: resellerId,
      });
      return NextResponse.json(
        { error: 'Reseller not found', details: `No reseller with slug: ${resellerId}` },
        { status: 404 }
      );
    }

    console.log('%c[ProcessCommand] ✅ Resolved slug to UUID:', 'color: #0097b2; font-weight: bold;', {
      slug: resellerId,
      uuid: actualResellerId,
    });

    // If tenantId is null, fetch all tenants for this reseller
    if (!tenantContext.tenantId) {
      const { data: tenants, error: tenantsError } = await supabase
        .from('tenants')
        .select('id, name, category, reseller_id')
        .eq('reseller_id', actualResellerId);

      if (tenantsError) {
        console.error('%c[ProcessCommand] ❌ Error fetching tenants:', 'color: #dc2626; font-weight: bold;', tenantsError);
        return NextResponse.json(
          { error: 'Failed to fetch tenant list for global command', details: tenantsError.message },
          { status: 500 }
        );
      }

      allTenants = (tenants as { id: string; name: string; category: string }[]) || [];
      console.log(`%c[ProcessCommand] ✅ Found ${allTenants.length} tenants for reseller: ${actualResellerId}`, 'color: #0097b2; font-weight: bold;');

      if (allTenants.length === 0) {
        console.warn('%c[ProcessCommand] ⚠️ No tenants found for reseller:', 'color: #f59e0b; font-weight: bold;', actualResellerId);
      }
    }

    // ── Pre-LLM Intent Detection: Fast-path for "what can you do" ─────
    // If the frontend provided branding capabilities, respond deterministically
    // without hitting the LLM. This avoids a 2-4s Groq round-trip for help.
    if (contextCapabilities && HELP_INTENT_REGEX.test(userCommand.trim())) {
      const typedCaps = contextCapabilities as unknown as StudioCapabilitiesMap;
      const helpSummary = buildCapabilitiesSummary(typedCaps);
      const allExamples = Object.values(typedCaps).flatMap(c => c.examples);

      console.log('%c[ProcessCommand] 🔷 Pre-LLM SYSTEM_HELLO — branding capabilities detected', 'color: #3b82f6; font-weight: bold;');
      return NextResponse.json({
        success: true,
        actionType: 'SYSTEM_HELP',
        targetIds: [],
        payload: {
          availableCommands: allExamples,
          brandingCapabilities: typedCaps,
        },
        summary: `I can help you ${helpSummary}. Try saying: "${allExamples[0] || 'Make the header minimalist'}".`,
        metadata: {
          processedAt: new Date().toISOString(),
          resellerId,
          model: 'pre-llm-intent',
        },
      });
    }

    // Build the system prompt dynamically from capabilities
    const SYSTEM_PROMPT = buildDeploymentOfficerPrompt(contextCapabilities as unknown as StudioCapabilitiesMap | undefined);

    // Construct the AI prompt with tenant context
    const userPrompt = `CURRENT CONFIG: ${JSON.stringify(currentConfig, null, 2)}

TARGET TENANT: ${tenantContext.tenantId || 'GLOBAL (multiple tenants)'}

${allTenants.length > 0 ? `AVAILABLE TENANTS:\n${allTenants.map(t => `- ${t.id}: ${t.name} (${t.category})`).join('\n')}\n\n` : ''}USER COMMAND: "${userCommand}"

Analyze if this is a SINGLE tenant command or a BULK/global command affecting multiple tenants.
Select appropriate targetIds from the available tenants.
Generate the deployment configuration.
Output ONLY valid JSON.`;

    // Call Groq API with 70b Request Cap: max_tokens: 1000
    const completion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      model: 'llama-3.3-70b-versatile',
      temperature: 0.3,
      max_tokens: 1000, // Strict cap to preserve TPM
      response_format: { type: 'json_object' },
    });

    const aiContent = completion.choices[0]?.message?.content;

    if (!aiContent) {
      throw new Error('Groq returned empty response');
    }

    // Parse and validate AI response
    let parsedResponse: unknown;
    try {
      parsedResponse = JSON.parse(aiContent);
    } catch {
      throw new Error('AI returned malformed JSON');
    }

    const aiValidation = AIResponseSchema.safeParse(parsedResponse);

    if (!aiValidation.success) {
      throw new Error('AI response does not match required schema');
    }

    const { actionType, targetIds, clientName, contextKey, payload, summary, confidenceScore } = aiValidation.data;

    // 🔷 Confidence Threshold: If the AI is unsure (< 0.85), demote actionable types to SYSTEM_NOTE
    // This prevents conversational filler from triggering ARMED state.
    // Meta-commands (SYSTEM_NOTE, SYSTEM_HELP, SYSTEM_DISARM, NO_MATCH, SYSTEM_BULK_*) are exempt.
    if (
      actionType !== 'SYSTEM_NOTE' &&
      actionType !== 'SYSTEM_DISARM' &&
      actionType !== 'NO_MATCH' &&
      actionType !== 'SYSTEM_HELP' &&
      actionType !== 'SYSTEM_BULK_CONFIRM' &&
      actionType !== 'SYSTEM_BULK_CANCEL' &&
      actionType !== 'SYSTEM_FILTER_GRID' &&
      actionType !== 'SYSTEM_EXPLAIN' &&
      confidenceScore !== undefined &&
      confidenceScore < 0.85
    ) {
      console.log('%c[ProcessCommand] ⚠️ Low confidence score — demoting to SYSTEM_NOTE:', 'color: #f59e0b; font-weight: bold;', { actionType, confidenceScore });
      return NextResponse.json({
        success: true,
        actionType: 'SYSTEM_NOTE',
        targetIds: [],
        payload: {},
        summary: 'Input unclear. Did you mean to issue a command?',
        metadata: {
          processedAt: new Date().toISOString(),
          resellerId,
          model: 'llama-3.3-70b-versatile',
        },
      });
    }

    // 🔷 DELETE_CLIENT: fuzzy match the client name against fetched tenants
    if (actionType === 'DELETE_CLIENT') {
      if (!clientName) {
        console.error('%c[ProcessCommand] ❌ DELETE_CLIENT intent missing clientName', 'color: #dc2626; font-weight: bold;');
        return NextResponse.json(
          { error: 'Delete command requires a client name' },
          { status: 400 }
        );
      }

      if (allTenants.length === 0) {
        // Tenants weren't pre-fetched (tenantId was provided) — fetch them now for matching
        const { data: tenants, error: tenantsError } = await supabase
          .from('tenants')
          .select('id, name')
          .eq('reseller_id', actualResellerId);

        if (tenantsError) {
          console.error('%c[ProcessCommand] ❌ Error fetching tenants for DELETE_CLIENT:', 'color: #dc2626; font-weight: bold;', tenantsError);
          return NextResponse.json(
            { error: 'Failed to fetch tenants for deletion' },
            { status: 500 }
          );
        }

        allTenants = (tenants || []).map(t => ({ ...t, category: '' }));
      }

      const matched = fuzzyMatchTenant(allTenants, clientName);
      if (!matched) {
        console.warn(`%c[ProcessCommand] ⚠️ Could not find a client matching '${clientName}'`, 'color: #f59e0b; font-weight: bold;');
        return NextResponse.json(
          { error: `Client "${clientName}" not found. Please check the name and try again.`, summary },
          { status: 404 }
        );
      }

      console.log(`%c[ProcessCommand] ✅ Matched client '${clientName}' → tenant ${matched.id}`, 'color: #0097b2; font-weight: bold;');
      return NextResponse.json({
        success: true,
        actionType: 'DELETE_CLIENT',
        targetIds: [matched.id],
        clientName: matched.name,
        summary,
        metadata: {
          processedAt: new Date().toISOString(),
          resellerId,
          model: 'llama-3.3-70b-versatile',
        },
      });
    }

    // 🔷 NO_MATCH short-circuit: skip Supabase writes entirely
    if (actionType === 'NO_MATCH') {
      console.log('%c[ProcessCommand] 🔶 Command classified as NO_MATCH — returning neutral response', 'color: #f59e0b; font-weight: bold;', { summary });
      return NextResponse.json({
        success: true,
        actionType: 'NO_MATCH',
        summary,
        metadata: {
          processedAt: new Date().toISOString(),
          resellerId,
          model: 'llama-3.3-70b-versatile',
        },
      });
    }

    // 🔷 SYSTEM_ MACRO COMMAND short-circuit: return structural payload without touching database
    // These are emitted by the MACRO COMMAND DICTIONARY in DEPLOYMENT_OFFICER when the user
    // speaks confirmation ("yes", "confirm"), cancellation ("no", "cancel"), or grid filter intents.
    // They carry empty targetIds and must NOT reach the DB update layer.
    if (actionType === 'SYSTEM_BULK_CONFIRM' || actionType === 'SYSTEM_BULK_CANCEL' || actionType === 'SYSTEM_FILTER_GRID' || actionType === 'SYSTEM_HELP' || actionType === 'SYSTEM_NOTE' || actionType === 'SYSTEM_DISARM' || actionType === 'SYSTEM_EXPLAIN') {
      console.log('%c[ProcessCommand] 🔷 SYSTEM_ macro command recognized:', 'color: #3b82f6; font-weight: bold;', { actionType, payload, contextKey });
      return NextResponse.json({
        success: true,
        actionType,
        targetIds: [],
        payload,
        contextKey, // Pass through for SYSTEM_EXPLAIN; undefined for others
        summary,
        metadata: {
          processedAt: new Date().toISOString(),
          resellerId,
          model: 'llama-3.3-70b-versatile',
        },
      });
    }

    // Guard: targetIds must be present for SINGLE/BULK (enforced by schema but TS needs narrowing)
    if (!targetIds || targetIds.length === 0) {
      return NextResponse.json(
        { error: 'AI response missing targetIds for deployment action' },
        { status: 500 }
      );
    }

    // Deep merge helper — merges source into target while preserving existing keys
    function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
      const output = { ...target };
      for (const key of Object.keys(source)) {
        if (
          source[key] !== null &&
          typeof source[key] === 'object' &&
          !Array.isArray(source[key]) &&
          typeof target[key] === 'object' &&
          target[key] !== null &&
          !Array.isArray(target[key])
        ) {
          output[key] = deepMerge(target[key] as Record<string, unknown>, source[key] as Record<string, unknown>);
        } else {
          output[key] = source[key];
        }
      }
      return output;
    }

    // Execute the updates with safe deep-merge into existing widget_config
    let updateResult;
    try {
      // Fetch existing widget_config for ALL target tenants first
      const { data: existingTenants, error: fetchError } = await supabase
        .from('tenants')
        .select('id, name, widget_config')
        .in('id', targetIds);

      if (fetchError) {
        throw new Error(`Failed to fetch existing configs: ${fetchError.message}`);
      }

      // Build per-tenant merged payloads
      const tenantMap = new Map(
        (existingTenants || []).map((t: { id: string; name: string; widget_config?: Record<string, unknown> }) => [t.id, t])
      );

      for (const targetId of targetIds) {
        const existing = tenantMap.get(targetId);
        const currentWidgetConfig = (existing?.widget_config as Record<string, unknown> | undefined) || {};
        const mergedPayload = deepMerge(currentWidgetConfig, payload as unknown as Record<string, unknown>);

        if (actionType === 'BULK' && targetIds.length > 1) {
          const { error: updateError } = await supabase
            .from('tenants')
            .update({ widget_config: mergedPayload })
            .eq('id', targetId);

          if (updateError) {
            throw new Error(`Bulk update for ${targetId} failed: ${updateError.message}`);
          }
        } else {
          // Single update for the first target (already guarded by targetIds.length > 0)
          const { data, error: updateError } = await supabase
            .from('tenants')
            .update({ widget_config: mergedPayload })
            .eq('id', targetId)
            .select('id, name')
            .single();

          if (updateError) {
            throw new Error(`Single update for ${targetId} failed: ${updateError.message}`);
          }

          updateResult = {
            type: 'SINGLE',
            updatedCount: 1,
            tenants: data ? [{ id: data.id, name: data.name }] : [],
          };
          break; // Single mode: only process the first target
        }
      }

      // If we processed bulk updates without breaking, build the result
      if (!updateResult && actionType === 'BULK') {
        updateResult = {
          type: 'BULK',
          updatedCount: targetIds.length,
          tenants: (existingTenants || [])
            .filter((t: { id: string }) => targetIds.includes(t.id))
            .map((t: { id: string; name: string }) => ({ id: t.id, name: t.name })),
        };
      }
    } catch (updateError) {
      const errorMessage = updateError instanceof Error ? updateError.message : String(updateError);
      console.error('%c[ProcessCommand] ❌ Update execution failed:', 'color: #dc2626; font-weight: bold;', updateError);
      return NextResponse.json(
        { error: `Update failed: ${errorMessage}` },
        { status: 500 }
      );
    }

    // Return successful response with TTS-ready summary
    return NextResponse.json({
      success: true,
      actionType,
      targetIds,
      payload,
      summary, // For Orpheus-v1 TTS
      updateResult,
      metadata: {
        processedAt: new Date().toISOString(),
        resellerId,
        model: 'llama-3.3-70b-versatile',
      },
    });

  } catch (error) {
    console.error('%c[ProcessCommand] ❌ AI Process Command Error:', 'color: #dc2626; font-weight: bold;', error);

    // Return clean error message as specified
    return NextResponse.json(
      { error: 'AI failed to generate a stable deployment path. Please try again.' },
      { status: 500 }
    );
  }
}

// Handle unsupported methods
export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405 }
  );
}

export async function PUT() {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405 }
  );
}

export async function DELETE() {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405 }
  );
}