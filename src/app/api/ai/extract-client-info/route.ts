import { NextResponse } from 'next/server';
import Groq from 'groq-sdk';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

// Zod schema for request validation
const ExtractClientInfoRequestSchema = z.object({
  transcript: z.string().min(1),
  fields: z.array(z.string().min(1)).min(1),
});

// Zod schema guaranteeing all keys exist in the response
// All data fields are nullable() so the contract forces null vs omission
const ExtractClientInfoResponseSchema = z.object({
  name: z.string().nullable().optional().default(null),
  industry: z.string().nullable().optional().default(null),
  category: z.string().nullable().optional().default(null),
  email: z.string().nullable().optional().default(null),
  mobile: z.string().nullable().optional().default(null),
  website: z.string().nullable().optional().default(null),
  is_override: z.boolean().default(false),
  confidence: z.number().min(0).max(1).default(0),
});

export async function POST(request: Request) {
  try {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'AI service not configured' }, { status: 500 });
    }

    const groq = new Groq({ apiKey });

    const body = await request.json();

    // Validate request body with Zod
    const requestValidation = ExtractClientInfoRequestSchema.safeParse(body);
    if (!requestValidation.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: requestValidation.error.flatten() },
        { status: 400 }
      );
    }

    const { transcript, fields } = requestValidation.data;

    const prompt = `Extract the following information from this transcript: "${transcript}"

Fields to extract:
${fields.join(', ')}

CRITICAL DATA EXTRACTION CONTRACT:
You must ALWAYS return a complete JSON object with the following keys.
If a field is not found in the user input, you MUST set its value to null.
Do not omit any keys.

Required JSON Structure:
{
  "name": string | null,
  "industry": string | null,
  "category": string | null,
  "email": string | null,
  "mobile": string | null,
  "website": string | null,
  "is_override": boolean,
  "confidence": number
}

SPECIAL INSTRUCTIONS FOR EMAIL:
- If the user provides an email-like string (e.g., "name dot com", "www dot name dot gmail dot com"),
  you must normalize it into a standard email format (e.g., "name@gmail.com").
- You must prioritize capturing these strings as the "email" field, even if the user omits the "@" symbol.
- Strip leading "www." if present but only if the result looks like an email (contains "@" after normalization).
- If the normalized value looks like a website URL instead of an email, set email to null.

INDUSTRY ENUM VALUES (exact only, must be UPPERCASE):
AUTOMOTIVE, RETAIL, HEALTHCARE, INSURANCE, GENERAL BUSINESS

CATEGORY MAPPING (use exact enum values):
  AUTOMOTIVE → VIN_DECODE, LOGISTICS, RETAIL_SALES
  RETAIL → ECOMMERCE, BRICK_AND_MORTAR
  HEALTHCARE → CLINICAL, WELLNESS
  INSURANCE → CLAIMS, UNDERWRITING
  GENERAL BUSINESS → GENERAL, CONSULTING, SERVICES

LITERAL EXTRACTION PRIORITY:
- If the user EXPLICITLY states an industry (e.g., "industry General"), return that exact value — do not override it with semantic classification.
- is_override = true if the user explicitly stated an industry, false if not mentioned.
- confidence = 1.0 if user stated industry, 0.0-0.95 if auto-classified from company name.

Output ONLY valid JSON — no explanations, no markdown, no extra text.`;

    const response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        {
          role: 'system',
          content: 'You are a precise data extraction assistant. Extract the requested fields from the transcript and return ONLY a valid JSON object. Never include explanations, greetings, or extra text. If a field is not found in the transcript, set its value to null. Never omit any keys.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.1,
      max_tokens: 500,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from Groq');
    }

    // Parse the JSON response
    let rawData: Record<string, unknown> = {};
    try {
      rawData = JSON.parse(content);
    } catch {
      console.error('Failed to parse Groq response:', content);
      // Fallback handled by Zod defaults below — all keys become null
    }

    // Enforce the contract via Zod: guarantee every key exists
    const validatedPayload = ExtractClientInfoResponseSchema.parse(rawData);

    console.log('OVG-PLATFORM-V2: Extracted client info:', validatedPayload);

    return NextResponse.json(validatedPayload);

  } catch (error) {
    console.error('Error extracting client info:', error);
    return NextResponse.json(
      { error: 'Failed to extract client information' },
      { status: 500 }
    );
  }
}