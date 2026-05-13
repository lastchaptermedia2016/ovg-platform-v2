import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';
import { z } from 'zod';
import { AUTOMOTIVE_CONSULTANT } from '@/core/ai/system-prompts';
import { mockNaTISLookup, saveVehicle, buildVehicleRecord } from '@/lib/services/automotive';
import type { NaTISLookupResult } from '@/lib/services/automotive';

export const dynamic = 'force-dynamic';

// Request validation schema
const AutomotiveRequestSchema = z.object({
  voiceCommand: z.string().min(1).max(2000),
  tenantId: z.string().uuid(),
  resellerId: z.string().uuid().optional(),
});

/**
 * Normalize STT artifacts in potential VIN strings.
 * Handles common Speech-to-Text quirks:
 *   - "zero" → "0" (when likely numeric context)
 *   - "oh" → "0" (common British SA English)
 *   - Spaces/dashes → stripped
 *   - Lowercase → uppercase
 */
function normalizeVIN(input: string): string {
  return input
    .toUpperCase()
    .replace(/\s+/g, '')       // Remove all whitespace
    .replace(/-/g, '')         // Remove dashes
    .replace(/OH/g, '0')       // "Oh" → "0"
    .replace(/ZERO/g, '0');    // "Zero" → "0"
}

/**
 * Validate a VIN string is exactly 17 characters
 * and contains only valid VIN characters (0-9, A-Z minus I, O, Q).
 */
function isValidVIN(vin: string): boolean {
  return /^[A-HJ-NPR-Z0-9]{17}$/.test(vin);
}

/**
 * Extract a 17-character VIN from raw text by:
 * 1. Normalizing STT artifacts
 * 2. Finding a 17-char alphanumeric substring
 * 3. Validating against VIN character rules
 */
function extractVIN(text: string): string | null {
  const normalized = normalizeVIN(text);
  // Match exactly 17 consecutive alphanumeric chars
  const match = normalized.match(/\b[A-HJ-NPR-Z0-9]{17}\b/);
  return match ? match[0] : null;
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'AI service not configured' }, { status: 500 });
  }

  const groq = new Groq({ apiKey });

  try {
    const body = await request.json();
    const validation = AutomotiveRequestSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({
        error: 'Invalid request',
        details: validation.error.flatten(),
      }, { status: 400 });
    }

    const { voiceCommand, tenantId } = validation.data;

    // Step 1: Try to extract VIN directly from the raw command text first
    let detectedVIN = extractVIN(voiceCommand);
    let aiResult = null;
    let lookupResult: NaTISLookupResult | null = null;

    // Step 2: If no VIN found by regex, use Groq to parse the intent
    if (!detectedVIN) {
      const completion = await groq.chat.completions.create({
        messages: [
          { role: 'system', content: AUTOMOTIVE_CONSULTANT },
          {
            role: 'user',
            content: `Voice command: "${voiceCommand}"

Analyze this command. If it contains a Vehicle Identification Number (VIN), extract and return it.
Remember: A VIN is exactly 17 characters, using 0-9 and A-Z (excluding I, O, Q).
Common STT issues: "zero" may be spoken as letter O, and "oh" may mean zero.`,
          },
        ],
        model: 'llama-3.3-70b-versatile',
        temperature: 0.1,
        max_tokens: 300,
        response_format: { type: 'json_object' },
      });

      const aiContent = completion.choices[0]?.message?.content;
      if (!aiContent) {
        throw new Error('AI returned empty response');
      }

      aiResult = JSON.parse(aiContent);

      // Try to extract VIN from the AI response
      if (aiResult.vin) {
        const normalized = normalizeVIN(aiResult.vin);
        if (isValidVIN(normalized)) {
          detectedVIN = normalized;
        }
      }
    }

    // Step 3: If no VIN found, return the AI response as-is (info/unknown)
    if (!detectedVIN) {
      return NextResponse.json({
        success: true,
        lookupPerformed: false,
        aiResponse: aiResult ?? {
          action: 'unknown',
          vin: null,
          vehicleSummary: 'No vehicle identification number detected.',
          response: 'I did not detect a valid 17-character VIN in your command. Please provide the full VIN so I can perform a NaTIS lookup.',
          requiresConfirmation: false,
        },
      });
    }

    // Step 4: VIN found — perform mock NaTIS lookup
    lookupResult = await mockNaTISLookup(detectedVIN);

    // Step 5: Build the response with vehicle data
    const fullSummary = `${lookupResult.year} ${lookupResult.make} ${lookupResult.model} ${lookupResult.engine_capacity || ''} (${lookupResult.colour}, ${lookupResult.transmission})`;

    return NextResponse.json({
      success: true,
      lookupPerformed: true,
      vin: detectedVIN,
      vehicle: lookupResult,
      summary: fullSummary,
      aiResponse: aiResult ?? {
        action: 'lookup',
        vin: detectedVIN,
        vehicleSummary: fullSummary,
        response: `I found a ${fullSummary}. Would you like to save this vehicle record to the platform?`,
        requiresConfirmation: true,
      },
      savePayload: buildVehicleRecord(tenantId, lookupResult),
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[Automotive] Error:', error);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

/**
 * Helper endpoint for saving a confirmed vehicle record.
 * POST /api/ai/automotive/save
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { tenantId, lookupResult: rawLookup } = body;

    if (!tenantId || !rawLookup) {
      return NextResponse.json({ error: 'tenantId and lookupResult are required' }, { status: 400 });
    }

    const lookup = rawLookup as NaTISLookupResult;
    const vehicleData = buildVehicleRecord(tenantId, lookup);
    const saved = await saveVehicle(vehicleData);

    return NextResponse.json({
      success: true,
      vehicle: saved,
      message: `Vehicle ${lookup.make} ${lookup.model} (${lookup.vin}) has been saved successfully.`,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[Automotive Save] Error:', error);
    return NextResponse.json({ error: `Failed to save vehicle: ${errorMessage}` }, { status: 500 });
  }
}

// Handle unsupported methods
export async function GET() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}

export async function DELETE() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}