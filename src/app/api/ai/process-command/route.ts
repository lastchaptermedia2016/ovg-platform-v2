import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';
import { z } from 'zod';
import { createClient as createSupabaseClient } from '@/lib/supabase/server';

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

type ProcessCommandRequest = z.infer<typeof ProcessCommandSchema>;

// Response schema for AI output - supports both SINGLE and BULK actions
const AIResponseSchema = z.object({
  actionType: z.enum(['SINGLE', 'BULK']),
  targetIds: z.array(z.string().uuid()).min(1),
  payload: z.record(z.any()),
  summary: z.string().min(10).max(500), // For TTS confirmation
});

const SYSTEM_PROMPT = `You are a Technical Deployment Officer for OVG Platform's AI Intelligence module.

Your role is to analyze user commands and generate precise configuration updates for widget deployments.
You can handle BOTH single-tenant updates AND bulk/global updates across multiple tenants.

RULES:
1. Analyze the user's natural language command against the provided tenant context
2. Determine if the command targets a SINGLE tenant or MULTIPLE tenants (BULK)
3. For BULK commands: select appropriate targetIds based on the command intent (category filters, all tenants, etc.)
4. Generate a summary string for voice confirmation (keep under 150 chars)
5. Output a JSON object with actionType, targetIds array, payload, and summary
6. NEVER output markdown, explanations, or code blocks - ONLY valid JSON
7. Respect the existing theme colors (Electric Blue #0097b2 and Gold #D4AF37) unless explicitly changed

OUTPUT FORMAT (STRICT JSON):
{
  "actionType": "SINGLE" | "BULK",
  "targetIds": ["tenant-uuid-1", "tenant-uuid-2"],
  "payload": {
    "theme": { "primary": "#color", "secondary": "#color" },
    "behavior": { "prompt": "system prompt text", "tone": "professional" },
    "ui": { "badgeStyle": "glass", "animation": "pulse" }
  },
  "summary": "Brief description of changes for voice confirmation"
}

The payload should only include fields that need to change. Preserve all existing values not explicitly changed.`;

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
        .eq('slug', resellerId)
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

    // Execute the updates
    let updateResult;
    try {
      if (actionType === 'BULK' && targetIds.length > 1) {
        // Bulk update using .in() query
        const { data, error: updateError } = await supabase
          .from('tenants')
          .update({ widget_config: payload })
          .in('id', targetIds)
          .select('id, name');

        if (updateError) {
          throw new Error(`Bulk update failed: ${updateError.message}`);
        }

        updateResult = {
          type: 'BULK',
          updatedCount: data?.length || 0,
          tenants: data?.map((t: { id: string; name: string }) => ({ id: t.id, name: t.name })) || [],
        };
      } else {
        // Single tenant update
        const targetId = targetIds[0];
        const { data, error: updateError } = await supabase
          .from('tenants')
          .update({ widget_config: payload })
          .eq('id', targetId)
          .select('id, name')
          .single();

        if (updateError) {
          throw new Error(`Single update failed: ${updateError.message}`);
        }

        updateResult = {
          type: 'SINGLE',
          updatedCount: 1,
          tenants: data ? [{ id: data.id, name: data.name }] : [],
        };
      }
    } catch (updateError: any) {
      console.error('Update execution failed:', updateError);
      return NextResponse.json(
        { error: `Update failed: ${updateError.message}` },
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
