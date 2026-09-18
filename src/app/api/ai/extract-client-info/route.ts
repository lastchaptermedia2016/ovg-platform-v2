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
  vibe: z.string().nullable().optional().default(null),
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
  "vibe": string | null
}

STEP-GATING ENFORCEMENT (CRITICAL):
The voice onboarding flows in STRICT STEPS. Required fields for each step CANNOT be skipped or deferred.
- Step 0 (name + industry): BOTH "name" AND "industry" are REQUIRED. Do NOT advance to Step 1 without BOTH.
- Step 1 (email): "email" is REQUIRED. Do NOT advance to Step 2 without it.
- Step 2 (mobile + website): AT LEAST ONE of "mobile" OR "website" is REQUIRED. Do NOT advance to Step 3 without at least one.
- Step 3 (vibe): "vibe" is REQUIRED. Do NOT advance to Step 4 without it.

If a REQUIRED field for the active step is missing from the transcript, you MUST set it to null in the JSON.
The calling system will detect the missing required field and RE-PROMPT the user SPECIFICALLY for that field.
NEVER suggest "we can come back to this later" or "you can skip this" for REQUIRED fields.

SPECIAL INSTRUCTIONS FOR EMAIL:
- If the user provides an email-like string (e.g., "name dot com", "www dot name dot gmail dot com"),
  you must normalize it into a standard email format (e.g., "name@gmail.com").
- You must prioritize capturing these strings as the "email" field, even if the user omits the "@" symbol.
- Strip leading "www." if present but only if the result looks like an email (contains "@" after normalization).
- If the normalized value looks like a website URL instead of an email, set email to null.

INDUSTRY ENUM VALUES (exact only, must be UPPERCASE):
AUTOMOTIVE, RETAIL, HEALTHCARE, INSURANCE, AI AUTOMATION, SaaS, GENERAL BUSINESS

CATEGORY MAPPING (use exact enum values):
  AUTOMOTIVE → VIN_DECODE, LOGISTICS, RETAIL_SALES
  RETAIL → ECOMMERCE, BRICK_AND_MORTAR
  HEALTHCARE → CLINICAL, WELLNESS
  INSURANCE → CLAIMS, UNDERWRITING
  AI AUTOMATION → AGENTIC_AI, WORKFLOW_AUTOMATION, CHATBOT
  SaaS → CUSTOMER_SUPPORT, DEVOPS, ANALYTICS
  GENERAL BUSINESS → GENERAL, CONSULTING, SERVICES

LITERAL EXTRACTION PRIORITY:
- If the user EXPLICITLY states an industry or category, return that exact value — do not override it with semantic classification.
- If the user EXPLICITLY states a vibe/description, capture it verbatim in the vibe field.

Output ONLY valid JSON — no explanations, no markdown, no extra text.`;

    // Simplify the user prompt to be more JSON-friendly
    const simplifiedPrompt = `Extract these fields from the transcript. Return ONLY valid JSON:
{
  "name": "...",
  "industry": "...",
  "category": "...",
  "email": "...",
  "mobile": "...",
  "website": "...",
  "vibe": "..."
}

Transcript:
${prompt}`;

    let parsedResponse: Record<string, unknown>;
    try {
      const response = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [
          {
            role: 'system',
            content: `You are a precise data extraction assistant. Extract the requested fields from the transcript and return ONLY a valid JSON object. Never include explanations, greetings, or extra text. If a field is not found in the transcript, set its value to null. Never omit any keys.

STEP-GATING ENFORCEMENT (CRITICAL):
The voice onboarding flows in STRICT STEPS. Required fields for each step CANNOT be skipped or deferred.
- Step 0 (name + industry): BOTH "name" AND "industry" are REQUIRED. Do NOT advance to Step 1 without BOTH.
- Step 1 (email): "email" is REQUIRED. Do NOT advance to Step 2 without it.
- Step 2 (mobile + website): AT LEAST ONE of "mobile" OR "website" is REQUIRED. Do NOT advance to Step 3 without at least one.
- Step 3 (vibe): "vibe" is REQUIRED. Do NOT advance to Step 4 without it.

If a REQUIRED field for the active step is missing from the transcript, you MUST set it to null in the JSON.
The calling system will detect the missing required field and RE-PROMPT the user SPECIFICALLY for that field.
NEVER suggest "we can come back to this later" or "you can skip this" for REQUIRED fields.

EXTRACTION FIELDS:
You MUST extract and return ALL of these fields in your JSON response:
- name: Company/client name (apply phonetic normalization rules below)
- industry: Industry sector or vertical (e.g., "AI AUTOMATION", "SaaS", "Healthcare")
- category: Subcategory or use case (e.g., "WORKFLOW_AUTOMATION", "Customer Support")
- email: Contact email address. If spoken as "donna at zeeder dot ai", convert to "donna@zeeder.ai"
- mobile: Phone number. Normalize to format like "555-654-4321" or "+1-555-654-4321"
- website: Company website URL. If spoken as "zeeder dot ai", convert to "https://zeeder.ai"
- vibe: Brand personality, company description, or tone spoken by the user (e.g., "Young and innovative AI startups")

VOICE TRANSCRIPTION PATTERNS TO LISTEN FOR:
- "My email is..." / "Contact at..." / "Email is..." → extract email field
- "Phone..." / "Call me at..." / "Mobile is..." / "Reach me at..." → extract mobile field
- "Website..." / "Find us at..." / "Visit..." / "Our site is..." → extract website field
- "We're..." / "We focus on..." / "We help..." / "We specialize..." / "Our vibe is..." → extract vibe field
- "Industry..." / "We work in..." / "Sector is..." → extract industry field
- "Category..." / "Use case..." / "Our focus area..." → extract category field

PHONETIC BRAND NAME NORMALIZATION RULES:
Incoming text is generated via live voice transcription and may contain regional acoustic errors for custom proper nouns or tech brands. The raw acoustic model is prone to warping custom proper nouns toward generic en-US dictionary words. Analyze the extracted corporate names contextually and correct them before emitting JSON:

1. If the text sounds identical to "Xneelio" but is spelled as "Xnelia" or "Xneelo", extract the clean corporate spelling: "Xneelio".
2. If the text sounds identical to "Zeeder" but is spelled as "Zeta", "Zita", or "Cedar" in the context of a client name, extract the correct brand spelling: "Zeeder".
3. Maintain this high-fidelity spelling correction for unique brand names ending in localized suffixes (-io, -er, -o).
4. These normalizations apply ONLY to the \`name\` field. They MUST NOT alter email, mobile, website, industry, or category values.
5. If the transcript contains a brand spelling that is genuinely ambiguous and the misheard word is also a valid common noun (e.g. "Zeta" could be a Greek letter or our brand), prefer the brand spelling ONLY when the surrounding transcript context refers to a client, tenant, or company name.

OUTPUT FORMAT:
Return ONLY this JSON structure with no additional text:
{
  "name": "...",
  "industry": "...",
  "category": "...",
  "email": "...",
  "mobile": "...",
  "website": "...",
  "vibe": "..."
}`
          },
          {
            role: 'user',
            content: simplifiedPrompt
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

      parsedResponse = JSON.parse(content);
    } catch (error) {
      // If JSON generation fails, return partial extraction with nulls
      console.warn('JSON generation failed, returning partial:', error instanceof Error ? error.message : String(error));
      
      // Check for Groq JSON validation failure (400/json_validate_failed)
      if (error && typeof error === 'object' && 'status' in error) {
        const status = (error as { status: number }).status;
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (status === 400 && errorMessage.includes('json_validate_failed')) {
          console.log('[EXTRACT-CLIENT-INFO-TRACE] JSON validation failed, returning fallback:', errorMessage);
        }
      }
      
      parsedResponse = {
        name: null,
        industry: null,
        category: null,
        email: null,
        mobile: null,
        website: null,
        vibe: null,
      };
    }

    // Enforce the contract via Zod: guarantee every key exists
    const validatedPayload = ExtractClientInfoResponseSchema.parse(parsedResponse);

    const sanitizedPayload: Record<string, unknown> = {};
    for (const key of Object.keys(validatedPayload) as (keyof typeof validatedPayload)[]) {
      const val = validatedPayload[key];
      if (typeof val === 'string') {
        sanitizedPayload[key] = val.replace(/[.!?]+$/, '').trim();
      } else {
        sanitizedPayload[key] = val;
      }
    }

    console.log('OVG-PLATFORM-V2: Extracted client info:', sanitizedPayload);

    return NextResponse.json(sanitizedPayload);

  } catch (error) {
    console.error('Error extracting client info:', error);

    // Handle Groq JSON validation failure (400/json_validate_failed) - return fallback with 200
    if (error && typeof error === 'object' && 'status' in error) {
      const status = (error as { status: number }).status;
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (status === 400 && errorMessage.includes('json_validate_failed')) {
        console.log('[EXTRACT-CLIENT-INFO-TRACE] JSON validation failed in outer catch, returning fallback:', errorMessage);
        return NextResponse.json({
          name: null,
          industry: null,
          category: null,
          email: null,
          mobile: null,
          website: null,
          vibe: null,
        }, { status: 200 });
      }
      
      // Surface Groq API permission/model access errors (403/404)
      if (status === 403 || status === 404) {
        return NextResponse.json(
          { error: `Groq API error (${status}): ${errorMessage}` },
          { status: 502 }
        );
      }
    }

    return NextResponse.json(
      { error: 'Failed to extract client information' },
      { status: 500 }
    );
  }
}