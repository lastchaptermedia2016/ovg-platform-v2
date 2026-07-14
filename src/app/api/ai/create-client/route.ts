import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';
import { createClient as createSupabaseClient } from '@/lib/supabase/server';
import { getAuthenticatedUser } from '@/lib/auth/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { z } from 'zod';
import { normalizeEmail } from '@/lib/utils/sanitize-email';
import { resolveResellerId } from '@/lib/supabase/resolve-reseller-id';

export const dynamic = 'force-dynamic';

// Production Excellence: Allowed industry enum values
const ALLOWED_INDUSTRIES = [
  'AUTOMOTIVE',
  'RETAIL',
  'HEALTHCARE',
  'INSURANCE',
  'AI AUTOMATION',
  'GENERAL BUSINESS',
] as const;

// Zod schema for request validation
// - is_override: boolean indicating if the user explicitly stated an industry
// - confidence: 0.0-1.0 confidence in the extraction
// - email: auto-sanitized via .transform() to handle STT artifacts
const CreateClientRequestSchema = z.object({
  voiceCommand: z.string().optional(),
  resellerSlug: z.string().min(1),
  resellerId: z.string().uuid().optional(),
  parseOnly: z.boolean().default(false),
  clientData: z.object({
    name: z.string().min(1),
    industry: z.enum(ALLOWED_INDUSTRIES, {
      errorMap: () => ({ message: 'Industry must be one of: AUTOMOTIVE, RETAIL, HEALTHCARE, INSURANCE, AI AUTOMATION, GENERAL BUSINESS' })
    }),
    category: z.string().optional(),
    email: z.string().email().nullable().optional().transform((val) => {
      // Layer 3 (Zod Contract): Auto-sanitize email via normalizeEmail
      if (val === null || val === undefined) return val;
      return normalizeEmail(val) ?? val; // fall back to original if normalize fails
    }),
    mobile: z.string().nullable().optional(),
    website: z.string().nullable().optional(),
    systemPrompt: z.string().nullable().optional(),
    reseller_id: z.string().uuid().optional(),
    is_override: z.boolean().optional().default(false),
    confidence: z.number().min(0).max(1).optional().default(0),
  }).optional(),
});

// Helper function to normalize URLs with soft validation
const normalizeUrl = (url: string | null | undefined): string | null => {
  if (!url || url.trim() === '') return null;
  
  let cleanUrl = url.trim();
  
  // Validation Logic: Soften regex to handle raw SST text gracefully
  // Remove common STT artifacts and normalize "dot com" phrases
  cleanUrl = cleanUrl
    .replace(/\s+dot\s+com/gi, '.com')
    .replace(/\s+dot\s+/gi, '.')
    .replace(/\s+/g, '')
    .toLowerCase();
  
  // If already has protocol, return as-is
  if (cleanUrl.startsWith('http://') || cleanUrl.startsWith('https://')) {
    return cleanUrl;
  }
  
  // Validation Logic: Check if it looks like a domain (has at least one dot)
  if (!cleanUrl.includes('.')) {
    console.log('[CreateClient] Website does not contain a dot, treating as invalid:', cleanUrl);
    return null;
  }
  
  // Add https:// for domains without protocol
  return `https://${cleanUrl}`;
};

// Sanitize Inputs: String formatter to prevent database crashes from raw SST text
const sanitizeString = (value: string | null | undefined): string | null => {
  if (!value || value.trim() === '') return null;
  
  return value
    .trim()
    .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters
    .substring(0, 500); // Limit length to prevent overflow
};

const sanitizeMobile = (mobile: string | null | undefined): string | null => {
  if (!mobile || mobile.trim() === '') return null;
  
  // Remove all non-numeric characters except + for country code
  return mobile
    .trim()
    .replace(/[^\d+]/g, '')
    .substring(0, 20); // Limit length for phone numbers
};

const SYSTEM_PROMPT = `You are a client onboarding assistant. Extract client details from the user's voice command.

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
  "systemPrompt": string | null,
  "is_override": boolean,
  "confidence": number,
  "confirmed": true
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

RULES:
- Extract the business/client name exactly as spoken
- If industry is unclear or not mentioned, use GENERAL BUSINESS
- Format mobile numbers to E.164 format (include country code with + prefix)
- Ensure website URLs include the protocol (http:// or https://)
- Extract systemPrompt when user describes the client's vibe, role, or personality
- If no personality/vibe mentioned, set systemPrompt to null
- Always set confirmed to true
- Output ONLY valid JSON — no explanations, no markdown, no extra text.`;

export async function POST(request: NextRequest) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'AI service not configured' }, { status: 500 });

  const groq = new Groq({ apiKey });

  try {
    const body = await request.json();
    
    // Zod validation for request body
    const validationResult = CreateClientRequestSchema.safeParse(body);
    if (!validationResult.success) {
      console.error('[CreateClient] Zod validation error:', validationResult.error.flatten());
      return NextResponse.json({ 
        error: 'Invalid request body', 
        details: validationResult.error.flatten() 
      }, { status: 400 });
    }
    
    const { voiceCommand, resellerSlug, resellerId: explicitResellerId, parseOnly = false, clientData } = validationResult.data;

    if (!resellerSlug) {
      return NextResponse.json({ error: 'resellerSlug is required' }, { status: 400 });
    }

    const supabase = await createSupabaseClient();

    // Payload Enforcement: Use explicit resellerId if provided, otherwise resolve from slug
    let resellerId = explicitResellerId;
    let reseller = null;

    if (!resellerId) {
      // Resolve reseller slug to UUID via the shared utility
      // resolveResellerId queries slug first (text column), then falls back to tenant_id (UUID column)
      const resolvedId = await resolveResellerId(supabase, resellerSlug);

      if (!resolvedId) {
        return NextResponse.json({ error: 'Reseller not found' }, { status: 404 });
      }

      resellerId = resolvedId;
      reseller = { id: resolvedId };
    } else {
      console.log('OVG-PLATFORM-V2: Using explicit resellerId from payload:', { resellerId, resellerSlug });
      // Verify the explicit resellerId matches the slug using resolveResellerId
      const resolvedId = await resolveResellerId(supabase, resellerSlug);

      if (!resolvedId || resolvedId !== resellerId) {
        return NextResponse.json({ error: 'Reseller ID and slug mismatch' }, { status: 400 });
      }

      reseller = { id: resolvedId };
    }

    // MODE 1: Insert confirmed clientData directly (from handleConfirm)
    if (clientData && !parseOnly) {
      // Production Excellence: Use service role client for system-level tenant creation
      // supabaseAdmin is imported from @/lib/supabase/admin

      // RLS Debug: Log auth context and reseller matching
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      console.log('[CreateClient] Auth context:', {
        authUid: user?.id,
        resellerId: reseller.id,
        authError: authError?.message,
        uidMatch: user?.id === reseller.id,
        usingServiceRole: true
      });

      // Layer 2 (Backend Rescue): Normalize email before sanitization
      const rescuedEmail = normalizeEmail(clientData.email);

      // Normalize website URL before database insertion
      const normalizedWebsite = normalizeUrl(clientData.website);
      
      // Sanitize Inputs: Apply string formatters to prevent database crashes
      const sanitizedName = sanitizeString(clientData.name);
      const sanitizedEmail = sanitizeString(rescuedEmail);
      const sanitizedMobile = sanitizeMobile(clientData.mobile);
      const sanitizedSystemPrompt = sanitizeString(clientData.systemPrompt);
      
      console.log('[CreateClient] Inserting client with service role:', {
        name: sanitizedName,
        industry: clientData.industry,
        mobile: sanitizedMobile,
        website: normalizedWebsite,
        systemPrompt: sanitizedSystemPrompt,
        resellerId: resellerId,
        resellerSlug: resellerSlug,
        resellerIdType: typeof resellerId,
        resellerIdLength: resellerId?.length
      });

      // NULL Prevention Guard: Validate required fields before insert
      // Email is optional (nullable in DB, optional in Zod) — skip required check
      const missingFields: string[] = [];
      if (!sanitizedName || sanitizedName.trim() === '') missingFields.push('name');
      if (!clientData.industry || clientData.industry.trim() === '') missingFields.push('industry');

      if (missingFields.length > 0) {
        console.error('[CreateClient] NULL Prevention Guard: Missing required fields:', missingFields);
        return NextResponse.json({
          error: 'Missing required fields',
          missingFields: missingFields,
          message: `Partner, I missed the ${missingFields.join(', ')}—could you say that again?`
        }, { status: 400 });
      }

      // ── Authorization: verify the caller is linked to the target reseller ──
      // The service-role insert below bypasses RLS, so this ownership check is
      // the sole guard preventing an authenticated user from provisioning a
      // tenant under any reseller they do not own (multi-tenant isolation).
      const { userId: callerUserId, error: callerAuthError } = await getAuthenticatedUser();
      if (callerAuthError || !callerUserId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      const { data: resellerLink, error: linkError } = await supabaseAdmin
        .from('user_resellers')
        .select('reseller_id')
        .eq('user_id', callerUserId)
        .eq('reseller_id', resellerId)
        .maybeSingle();

      if (linkError) {
        console.error('[CreateClient] Reseller membership check failed:', linkError);
        return NextResponse.json({ error: 'Failed to verify reseller membership' }, { status: 500 });
      }

      if (!resellerLink) {
        console.warn('[CreateClient] Forbidden: user not linked to target reseller', {
          userId: callerUserId,
          resellerId,
        });
        return NextResponse.json(
          { error: 'Forbidden: you do not have permission to create clients for this reseller' },
          { status: 403 }
        );
      }

      const insertPayload = {
        tenant_id: crypto.randomUUID(),
        name: sanitizedName,
        industry: clientData.industry,
        email: sanitizedEmail,           // ✅ Now safe because the column exists
        mobile_number: sanitizedMobile,  // ✅ Matches database column
        website_url: normalizedWebsite,  // ✅ Matches database column
        reseller_id: resellerId,         // ✅ Verified UUID: 284931b2...
        system_prompt: sanitizedSystemPrompt,
        created_at: new Date().toISOString(),
        is_active: true,
        show_ovg_branding: true,
        pricing_tier_key: 'basic',
        custom_assets: {}
      };

      console.log('[CreateClient] Final database insert payload:', {
        ...insertPayload,
        resellerIdConfirmed: insertPayload.reseller_id
      });

      const { data: newTenant, error: insertError } = await supabaseAdmin
        .from('tenants')
        .insert(insertPayload)
        .select('id, name, industry')
        .single();

      if (insertError) {
        console.error('[CreateClient] Insert error:', insertError);
        console.error('[CreateClient] Error details:', {
          code: insertError.code,
          message: insertError.message,
          details: insertError.details,
          hint: insertError.hint,
          isPGRSTError: insertError.code?.includes('PGRST') || false
        });
        return NextResponse.json({ 
          error: 'Failed to create client', 
          details: insertError.message,
          errorCode: insertError.code,
          isPGRSTError: insertError.code?.includes('PGRST') || false
        }, { status: 500 });
      }

      // 🎨 AUTO-BRANDING: Generate AI branding based on industry and vibe
      let widgetConfig = null;
      try {
        const vibeDescription = clientData.systemPrompt 
          ? `${clientData.industry} business with ${clientData.systemPrompt} vibe`
          : `${clientData.industry} professional branding`;

        const vibeResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/ai/apply-vibe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vibe: vibeDescription,
            tenantId: newTenant.id,
            industry: clientData.industry,
          }),
        });

        if (vibeResponse.ok) {
          const vibeData = await vibeResponse.json();
          widgetConfig = vibeData.widgetConfig;
          
          // Update tenant with AI-generated widget_config using service role
          await supabaseAdmin
            .from('tenants')
            .update({ widget_config: widgetConfig })
            .eq('id', newTenant.id);
          
          console.log('[CreateClient] ✨ Auto-branding applied:', vibeData.widgetConfig.vibeName);
        }
      } catch (brandingError) {
        console.error('[CreateClient] Auto-branding failed (non-blocking):', brandingError);
        // Non-blocking - tenant is still created even if branding fails
      }

      return NextResponse.json({
        success: true,
        client: newTenant,
        confirmationMessage: `${clientData.name} has been added successfully.`,
        autoBranding: widgetConfig ? {
          applied: true,
          vibeName: widgetConfig.vibeName,
          description: widgetConfig.vibeDescription,
        } : null,
      });
    }

    // MODE 2: Parse voice command only (no DB insert)
    if (!voiceCommand) {
      return NextResponse.json({ error: 'voiceCommand is required for parsing' }, { status: 400 });
    }

    const completion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Voice command: "${voiceCommand}"` },
      ],
      model: 'llama-3.3-70b-versatile',
      temperature: 0.1,
      max_tokens: 200,
      response_format: { type: 'json_object' },
    });

    const aiContent = completion.choices[0]?.message?.content;
    if (!aiContent) throw new Error('AI returned empty response');

    const parsed = JSON.parse(aiContent);
    console.log('[CreateClient] Parsed:', parsed);

    if (!parsed.name || !parsed.industry) {
      return NextResponse.json({ error: 'Could not extract client details', parsed }, { status: 422 });
    }

    // Extract is_override and confidence from AI response with safe defaults
    // These fields tell the frontend whether the user explicitly stated the industry
    // or if the AI had to auto-classify it
    const isOverride = typeof parsed.is_override === 'boolean' ? parsed.is_override : false;
    const confidence = typeof parsed.confidence === 'number' ? Math.min(1, Math.max(0, parsed.confidence)) : 0;

    // Return parsed data with extraction metadata — no DB insert
    return NextResponse.json({
      success: true,
      parsed: {
        ...parsed,
        is_override: isOverride,
        confidence,
      },
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[CreateClient] Error:', error);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
