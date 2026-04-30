import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';
import { createClient as createSupabaseClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const SYSTEM_PROMPT = `Extract the client name to delete from the voice command.
Return ONLY valid JSON: { "clientName": "exact client name" }
Output ONLY the JSON, no other text.`;

export async function POST(request: NextRequest) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'AI service not configured' }, { status: 500 });

  const groq = new Groq({ apiKey });

  try {
    const { voiceCommand, resellerSlug } = await request.json();
    if (!voiceCommand || !resellerSlug) {
      return NextResponse.json({ error: 'voiceCommand and resellerSlug required' }, { status: 400 });
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

    // Extract client name from voice command
    const completion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Voice command: "${voiceCommand}"` },
      ],
      model: 'llama-3.1-8b-instant',
      temperature: 0.1,
      max_tokens: 100,
      response_format: { type: 'json_object' },
    });

    const aiContent = completion.choices[0]?.message?.content;
    if (!aiContent) throw new Error('AI returned empty response');

    const { clientName } = JSON.parse(aiContent);
    if (!clientName) {
      return NextResponse.json({ 
        error: 'Could not identify client to delete. Please specify the exact client name.' 
      }, { status: 422 });
    }

    // Find client by name (case-insensitive) under this reseller
    const { data: tenants, error: findError } = await supabase
      .from('tenants')
      .select('id, name')
      .eq('reseller_id', reseller.id)
      .ilike('name', `%${clientName}%`);

    if (findError || !tenants || tenants.length === 0) {
      return NextResponse.json({ 
        error: `Client "${clientName}" not found. Please check the name and try again.` 
      }, { status: 404 });
    }

    // If multiple matches, delete all of them
    const tenantIds = tenants.map(t => t.id);

    const { error: deleteError } = await supabase
      .from('tenants')
      .delete()
      .in('id', tenantIds);

    if (deleteError) {
      return NextResponse.json({ error: 'Failed to delete client' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      clientName: tenants[0].name,
      clientId: tenants[0].id,
      deletedCount: tenants.length,
    });

  } catch (error: any) {
    console.error('[DeleteClient] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
