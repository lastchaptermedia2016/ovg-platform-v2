import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';
import { createClient as createSupabaseClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const SYSTEM_PROMPT = `You are a client onboarding assistant. Extract client details from the user's voice command.
Return ONLY valid JSON in this exact format:
{
  "name": "client business name",
  "industry": "one of: AUTOMOTIVE, RETAIL, HEALTHCARE, INSURANCE, GENERAL BUSINESS",
  "email": "email if mentioned or null",
  "mobile": "mobile number in E.164 format (e.g., +1234567890) if mentioned or null",
  "website": "website URL with protocol (e.g., https://example.com) if mentioned or null",
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
- Always set confirmed to true
- Output ONLY the JSON object, no other text`;

export async function POST(request: NextRequest) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'AI service not configured' }, { status: 500 });

  const groq = new Groq({ apiKey });

  try {
    const body = await request.json();
    const { voiceCommand, resellerSlug, parseOnly = false, clientData } = body;

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
      const { data: newTenant, error: insertError } = await supabase
        .from('tenants')
        .insert({
          tenant_id: crypto.randomUUID(),
          name: clientData.name,
          industry: clientData.industry,
          reseller_id: reseller.id,
          is_active: true,
          show_ovg_branding: true,
          pricing_tier_key: 'basic',
          custom_assets: {},
          mobile_number: clientData.mobile || null,
          website_url: clientData.website || null,
        })
        .select('id, name, industry')
        .single();

      if (insertError) {
        console.error('[CreateClient] Insert error:', insertError);
        return NextResponse.json({ error: 'Failed to create client', details: insertError.message }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        client: newTenant,
        confirmationMessage: `${clientData.name} has been added successfully.`,
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
