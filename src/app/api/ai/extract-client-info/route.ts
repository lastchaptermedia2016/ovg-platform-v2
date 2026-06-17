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
AUTOMOTIVE, RETAIL, HEALTHCARE, INSURANCE, AI AUTOMATION, GENERAL BUSINESS

CATEGORY MAPPING (use exact enum values):
  AUTOMOTIVE → VIN_DECODE, LOGISTICS, RETAIL_SALES
  RETAIL → ECOMMERCE, BRICK_AND_MORTAR
  HEALTHCARE → CLINICAL, WELLNESS
  INSURANCE → CLAIMS, UNDERWRITING
  AI AUTOMATION → AGENTIC_AI, WORKFLOW_AUTOMATION, CHATBOT
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
          content: `You are a precise data extraction assistant. Extract the requested fields from the transcript and return ONLY a valid JSON object. Never include explanations, greetings, or extra text. If a field is not found in the transcript, set its value to null. Never omit any keys.

PHONETIC BRAND NAME NORMALIZATION RULES:
Incoming text is generated via live voice transcription and may contain regional acoustic errors for custom proper nouns or tech brands. The raw acoustic model is prone to warping custom proper nouns toward generic en-US dictionary words. Analyze the extracted corporate names contextually and correct them before emitting JSON:

1. If the text sounds identical to "Xneelio" but is spelled as "Xnelia" or "Xneelo", extract the clean corporate spelling: "Xneelio".
2. If the text sounds identical to "Zeeder" but is spelled as "Zeta", "Zita", or "Cedar" in the context of a client name, extract the correct brand spelling: "Zeeder".
3. Maintain this high-fidelity spelling correction for unique brand names ending in localized suffixes (-io, -er, -o).
4. These normalizations apply ONLY to the \`name\` field. They MUST NOT alter email, mobile, website, industry, or category values.
5. If the transcript contains a brand spelling that is genuinely ambiguous and the misheard word is also a valid common noun (e.g. "Zeta" could be a Greek letter or our brand), prefer the brand spelling ONLY when the surrounding transcript context refers to a client, tenant, or company name.`
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