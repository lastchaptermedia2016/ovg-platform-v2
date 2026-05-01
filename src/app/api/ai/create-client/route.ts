import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';
import { createClient as createSupabaseClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

// Production Excellence: Allowed industry enum values
const ALLOWED_INDUSTRIES = [
  'AUTOMOTIVE',
  'RETAIL', 
  'HEALTHCARE',
  'INSURANCE',
  'GENERAL BUSINESS'
] as const;

// Zod schema for request validation
const CreateClientRequestSchema = z.object({
  voiceCommand: z.string().optional(),
  resellerSlug: z.string().min(1),
  parseOnly: z.boolean().default(false),
  clientData: z.object({
    name: z.string().min(1),
    industry: z.enum(ALLOWED_INDUSTRIES, {
      errorMap: () => ({ message: 'Industry must be one of: AUTOMOTIVE, RETAIL, HEALTHCARE, INSURANCE, GENERAL BUSINESS' })
    }),
    email: z.string().email().nullable().optional(),
    mobile: z.string().nullable().optional(),
    website: z.string().nullable().optional(), // Flexible URL validation - will be normalized
    systemPrompt: z.string().nullable().optional(),
  }).optional(),
});

type CreateClientRequest = z.infer<typeof CreateClientRequestSchema>;

// Helper function to normalize URLs
const normalizeUrl = (url: string | null | undefined): string | null => {
  if (!url || url.trim() === '') return null;
  
  const cleanUrl = url.trim();
  
  // If already has protocol, return as-is
  if (cleanUrl.startsWith('http://') || cleanUrl.startsWith('https://')) {
    return cleanUrl;
  }
  
  // Add https:// for domains without protocol
  return `https://${cleanUrl}`;
};

const SYSTEM_PROMPT = `You are a client onboarding assistant. Extract client details from the user's voice command.
Return ONLY valid JSON in this exact format:
{
  "name": "client business name",
  "industry": "one of: AUTOMOTIVE, RETAIL, HEALTHCARE, INSURANCE, GENERAL BUSINESS",
  "email": "email if mentioned or null",
  "mobile": "mobile number in E.164 format (e.g., +1234567890) if mentioned or null",
  "website": "website URL with protocol (e.g., https://example.com) if mentioned or null",
  "systemPrompt": "client personality/vibe description if mentioned (e.g., 'innovative tech startup', 'traditional family business') or null",
  "confirmed": true
}
Rules:
- Extract the business/client name exactly as spoken
- Map industry to EXACTLY one of these values: AUTOMOTIVE, RETAIL, HEALTHCARE, INSURANCE, GENERAL BUSINESS
- If industry is unclear or not mentioned, use GENERAL BUSINESS
- If no email mentioned, set email to null
- Format mobile numbers to E.164 format (include country code with + prefix)
- Ensure website URLs include the protocol (http:// or https://)
- If no mobile or website mentioned, set them to null
- Extract systemPrompt when user describes the client's vibe, role, or personality (e.g., "innovative", "traditional", "fast-paced", "family-owned")
- If no personality/vibe mentioned, set systemPrompt to null
- Always set confirmed to true
- Output ONLY the JSON object, no other text`;

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
    
    const { voiceCommand, resellerSlug, parseOnly = false, clientData } = validationResult.data;

    if (!resellerSlug) {
      return NextResponse.json({ error: 'resellerSlug is required' }, { status: 400 });
    }

    const supabase = await createSupabaseClient();

    // Resolve reseller slug to UUID
    const { data: reseller, error: resellerError } = await supabase
      .from('resellers')
      .select('id')
      .eq('slug', resellerSlug)
      .single();

    if (resellerError || !reseller) {
      return NextResponse.json({ error: 'Reseller not found' }, { status: 404 });
    }

    // MODE 1: Insert confirmed clientData directly (from handleConfirm)
    if (clientData && !parseOnly) {
      // Production Excellence: Use service role client for system-level tenant creation
      const serviceClient = createServiceClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );

      // RLS Debug: Log auth context and reseller matching
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      console.log('[CreateClient] Auth context:', {
        authUid: user?.id,
        resellerId: reseller.id,
        authError: authError?.message,
        uidMatch: user?.id === reseller.id,
        usingServiceRole: true
      });

      // Normalize website URL before database insertion
      const normalizedWebsite = normalizeUrl(clientData.website);
      
      console.log('[CreateClient] Inserting client with service role:', {
        name: clientData.name,
        industry: clientData.industry,
        mobile: clientData.mobile,
        website: normalizedWebsite,
        systemPrompt: clientData.systemPrompt,
        resellerId: reseller.id,
      });

      const { data: newTenant, error: insertError } = await serviceClient
        .from('tenants')
        .insert({
          tenant_id: crypto.randomUUID(),
          name: clientData.name,
          industry: clientData.industry,
          reseller_id: reseller.id, // Ensure reseller_id from active session
          is_active: true,
          show_ovg_branding: true,
          pricing_tier_key: 'basic',
          custom_assets: {},
          mobile_number: clientData.mobile || null,
          website_url: normalizedWebsite,
          system_prompt: clientData.systemPrompt || null,
        })
        .select('id, name, industry')
        .single();

      if (insertError) {
        console.error('[CreateClient] Insert error:', insertError);
        return NextResponse.json({ error: 'Failed to create client', details: insertError.message }, { status: 500 });
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
          await serviceClient
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
      model: 'llama-3.1-8b-instant',
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

    // Return parsed data only — no DB insert
    return NextResponse.json({ success: true, parsed });

  } catch (error: any) {
    console.error('[CreateClient] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
