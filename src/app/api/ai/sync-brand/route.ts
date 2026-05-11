import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

interface BrandAnalysis {
  primaryColor: string;
  accentColor: string;
  suggestedHeaderImage: string;
  optimalOpacity: number;
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.error('❌ GROQ_API_KEY not configured');
    return NextResponse.json(
      { error: 'AI service not configured' },
      { status: 500 }
    );
  }

  const groq = new Groq({ apiKey });

  try {
    const { tenantId } = await request.json();

    if (!tenantId) {
      return NextResponse.json(
        { error: 'tenantId is required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Fetch tenant website_url
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('website_url, name, industry')
      .eq('id', tenantId)
      .single();

    if (tenantError || !tenant) {
      return NextResponse.json(
        { error: 'Tenant not found' },
        { status: 404 }
      );
    }

    if (!tenant.website_url) {
      return NextResponse.json(
        { error: 'Tenant has no website_url configured' },
        { status: 400 }
      );
    }

    // AI Prompt to analyze brand from website
    const SYSTEM_PROMPT = `You are a Brand Analysis AI for the OVG Platform Branding Studio.

Your task is to analyze a website URL and extract brand elements for a chat widget header/footer customization.

Given a website URL, return a JSON object with:
1. primaryColor: The dominant brand color (hex format, e.g., "#0097b2")
2. accentColor: A complementary accent color (hex format)
3. suggestedHeaderImage: A description of what header background image would work well (we'll generate this later)
4. optimalOpacity: A number between 0.6 and 0.95 representing ideal background opacity for readability

Rules:
- Use Electric Blue #0097b2 and Gold #FFD700 as fallbacks if colors can't be determined
- For suggestedHeaderImage, describe an abstract geometric pattern or gradient that matches the brand
- optimalOpacity should be higher (0.85-0.95) for light backgrounds, lower (0.6-0.75) for dark/image backgrounds
- Output ONLY valid JSON, no explanations or markdown

Output Format:
{
  "primaryColor": "#hexcolor",
  "accentColor": "#hexcolor",
  "suggestedHeaderImage": "description of ideal header background",
  "optimalOpacity": 0.75
}`;

    const userPrompt = `Analyze the brand identity of this website: ${tenant.website_url}

Tenant Name: ${tenant.name || 'Unknown'}
Industry: ${tenant.industry || 'General'}

Extract brand colors and suggest widget styling that would match their website aesthetic.`;

    const completion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      model: 'llama-3.3-70b-versatile',
      temperature: 0.3,
      max_tokens: 500,
      response_format: { type: 'json_object' },
    });

    const aiContent = completion.choices[0]?.message?.content;

    if (!aiContent) {
      throw new Error('AI returned empty response');
    }

    let brandAnalysis: BrandAnalysis;
    try {
      brandAnalysis = JSON.parse(aiContent);
    } catch {
      throw new Error('AI returned malformed JSON');
    }

    // Validate the response
    if (!brandAnalysis.primaryColor || !brandAnalysis.accentColor) {
      throw new Error('AI response missing required fields');
    }

    // Ensure opacity is in valid range
    brandAnalysis.optimalOpacity = Math.max(0.6, Math.min(0.95, brandAnalysis.optimalOpacity || 0.75));

    console.log('✅ Brand analysis complete:', {
      tenantId,
      website: tenant.website_url,
      primaryColor: brandAnalysis.primaryColor,
      accentColor: brandAnalysis.accentColor,
    });

    return NextResponse.json({
      success: true,
      brandAnalysis,
      metadata: {
        tenantId,
        websiteUrl: tenant.website_url,
        processedAt: new Date().toISOString(),
        model: 'llama-3.3-70b-versatile',
      },
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to analyze brand from website';
    console.error('❌ Brand sync error:', error);
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405 }
  );
}
