import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';
import { z } from 'zod';
import { createClient as createSupabaseClient } from '@/lib/supabase/server';
import { DEPLOYMENT_OFFICER } from '@/core/ai/system-prompts';

// Force dynamic to prevent build-time initialization
export const dynamic = 'force-dynamic';

// Request validation schema - tenantId is now optional for global commands
const ProcessCommandSchema = z.object({
  resellerId: z.string().min(1), // Reseller slug, not UUID
  userCommand: z.string().min(1).max(2000),
  currentConfig: z.record(z.any()).default({}),
  tenantContext: z.object({
    tenantId: z.string().uuid().optional(), // Optional for global commands
    category: z.string().optional(),
  }),
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
type ProcessCommandRequest = z.infer<typeof ProcessCommandSchema>;

// Response schema for AI output - supports SINGLE, BULK, NO_MATCH, and SYSTEM_ macro commands
// SYSTEM_BULK_CONFIRM / SYSTEM_BULK_CANCEL / SYSTEM_FILTER_GRID are structural payloads
// that bypass database writes (see short-circuit guard in POST handler).
const AIResponseSchema = z.object({
  actionType: z.enum(['SINGLE', 'BULK', 'NO_MATCH', 'SYSTEM_BULK_CONFIRM', 'SYSTEM_BULK_CANCEL', 'SYSTEM_FILTER_GRID', 'SYSTEM_UPDATE_BRANDING']),
  targetIds: z.array(z.string().uuid()).optional(),
  payload: z.record(z.any()).optional().default({}),
  summary: z.string().min(3).max(500), // For TTS confirmation
});

// SYSTEM_PROMPT is now imported from @/core/ai/system-prompts as DEPLOYMENT_OFFICER
// which includes the MACRO COMMAND DICTIONARY block.
const SYSTEM_PROMPT = DEPLOYMENT_OFFICER;

export async function POST(request: NextRequest) {
  // Initialize Groq client inside handler for production excellence
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.error('❌ GROQ_API_KEY not configured on server');
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
      console.error('Zod Validation Error:', validationResult.error.flatten());
      console.error('Request Body:', body);
      return NextResponse.json(
        { error: 'Invalid request parameters', details: validationResult.error.flatten() },
        { status: 400 }
      );
    }

    const { resellerId, userCommand, currentConfig, tenantContext } = validationResult.data;

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

    // 🔷 Production Excellence: Resolve reseller_slug to reseller_id first
    let actualResellerId = resellerId;
    
    // Check if resellerId looks like a slug (not a UUID)
    const isSlug = !resellerId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    
    if (isSlug) {
      console.log('%c[ProcessCommand] 🔷 Detected slug, resolving to UUID...', 'color: #0097b2;');
      const { data: reseller, error: resellerError } = await supabase
        .from('resellers')
        .select('id')
        .eq('tenant_id', resellerId)
        .single();
      
      if (resellerError || !reseller) {
        console.error('%c[ProcessCommand] ❌ Failed to resolve reseller slug:', 'color: #dc2626; font-weight: bold;', { 
          slug: resellerId, 
          error: resellerError?.message 
        });
        return NextResponse.json(
          { error: 'Reseller not found', details: `No reseller with slug: ${resellerId}` },
          { status: 404 }
        );
      }
      
      actualResellerId = reseller.id;
      console.log('%c[ProcessCommand] ✅ Resolved slug to UUID:', 'color: #0097b2; font-weight: bold;', { 
        slug: resellerId, 
        uuid: actualResellerId 
      });
    }

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

    const { actionType, targetIds, payload, summary } = aiValidation.data;

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
    if (actionType === 'SYSTEM_BULK_CONFIRM' || actionType === 'SYSTEM_BULK_CANCEL' || actionType === 'SYSTEM_FILTER_GRID') {
      console.log('%c[ProcessCommand] 🔷 SYSTEM_ macro command recognized:', 'color: #3b82f6; font-weight: bold;', { actionType, payload });
      return NextResponse.json({
        success: true,
        actionType,
        targetIds: [],
        payload,
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
        const mergedPayload = deepMerge(currentWidgetConfig, payload);

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
      console.error('Update execution failed:', updateError);
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
    console.error('AI Process Command Error:', error);

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
