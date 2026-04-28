import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';
import { z } from 'zod';

// Initialize Groq client
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

// Request validation schema
const ProcessCommandSchema = z.object({
  resellerId: z.string().min(1), // Reseller slug, not UUID
  userCommand: z.string().min(1).max(2000),
  currentConfig: z.record(z.any()).default({}),
  tenantContext: z.object({
    tenantId: z.string().uuid(),
    category: z.string().optional(),
  }),
});

type ProcessCommandRequest = z.infer<typeof ProcessCommandSchema>;

// Response schema for AI output
const AIResponseSchema = z.object({
  technicalSummary: z.string().min(10).max(500),
  configPatch: z.record(z.any()),
});

const SYSTEM_PROMPT = `You are a Technical Deployment Officer for OVG Platform's AI Intelligence module.

Your role is to analyze user commands and generate precise configuration updates for widget deployments.

RULES:
1. Analyze the user's natural language command against the current widget configuration
2. Generate a technical summary describing what changes will be made
3. Output a JSON patch object containing ONLY the fields that need to change
4. NEVER output markdown, explanations, or code blocks - ONLY valid JSON
5. Respect the existing theme colors (Electric Blue #0097b2 and Gold #D4AF37) unless explicitly changed
6. For "Insurance" mode, emphasize trust signals, security badges, and professional tone
7. For "Automotive" mode, emphasize speed, inventory, and urgency
8. For "Retail" mode, emphasize deals, scarcity, and promotions

OUTPUT FORMAT (STRICT JSON):
{
  "technicalSummary": "Brief description of changes (max 150 chars)",
  "configPatch": {
    "theme": { "primary": "#color", "secondary": "#color" },
    "behavior": { "prompt": "system prompt text", "tone": "professional" },
    "ui": { "badgeStyle": "glass", "animation": "pulse" }
  }
}

The configPatch should only include fields that differ from currentConfig. Preserve all existing values not explicitly changed.`;

export async function POST(request: NextRequest) {
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
    // In production, this would verify the reseller owns the tenant
    if (!resellerId) {
      return NextResponse.json(
        { error: 'Unauthorized: Reseller ID required' },
        { status: 403 }
      );
    }

    // Construct the AI prompt
    const userPrompt = `CURRENT CONFIG: ${JSON.stringify(currentConfig, null, 2)}

TENANT CONTEXT: ${JSON.stringify(tenantContext)}

USER COMMAND: "${userCommand}"

Generate the deployment configuration patch. Output ONLY valid JSON.`;

    // Call Groq API
    const completion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      model: 'llama-3.3-70b-versatile',
      temperature: 0.3,
      max_tokens: 1024,
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

    const { technicalSummary, configPatch } = aiValidation.data;

    // Return successful response
    return NextResponse.json({
      success: true,
      technicalSummary,
      configPatch,
      metadata: {
        processedAt: new Date().toISOString(),
        resellerId,
        tenantId: tenantContext.tenantId,
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
