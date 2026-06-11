import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';
import { createClient } from '@/lib/supabase/server';
import { deleteResellerClients } from '@/lib/db/reseller-clients';

export const dynamic = 'force-dynamic';

const SYSTEM_PROMPT = `Extract the client name to delete from the voice command.
Return ONLY valid JSON: { "clientName": "exact client name" }
Output ONLY the JSON, no other text.`;

export async function POST(request: NextRequest) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'AI service not configured' }, { status: 500 });

  const groq = new Groq({ apiKey });

  try {
    // 1. Verify session
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Resolve reseller from user_resellers (not request body)
    const { data: userResellerData, error: mappingError } = await supabase
      .from('user_resellers')
      .select(`
        reseller_id,
        resellers (
          tenant_id
        )
      `)
      .eq('user_id', user.id)
      .maybeSingle();

    if (mappingError || !userResellerData) {
      return NextResponse.json({ error: 'Forbidden: no reseller association' }, { status: 403 });
    }
    const userReseller = {
      reseller_id: userResellerData.reseller_id,
      reseller_slug: (userResellerData.resellers as unknown as { tenant_id: string })?.tenant_id,
    };

    // 3. Accept only voiceCommand from body (no resellerSlug)
    const { voiceCommand } = await request.json();
    if (!voiceCommand) {
      return NextResponse.json({ error: 'voiceCommand required' }, { status: 400 });
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

    // 4. Scope tenant queries to userReseller.reseller_id (ownership enforcement)
    const { data: tenants, error: findError } = await supabase
      .from('tenants')
      .select('id, name, reseller_id')
      .eq('reseller_id', userReseller.reseller_id)
      .ilike('name', `%${clientName}%`);

    if (findError || !tenants || tenants.length === 0) {
      return NextResponse.json({ 
        error: `Client "${clientName}" not found. Please check the name and try again.` 
      }, { status: 404 });
    }

    // Ownership check: verify every matched tenant belongs to the caller's reseller
    for (const tenant of tenants) {
      if (tenant.reseller_id !== userReseller.reseller_id) {
        return NextResponse.json({ error: 'Forbidden: tenant not owned by your reseller' }, { status: 403 });
      }
    }

    const tenantIds = tenants.map(t => t.id);

    await deleteResellerClients(userReseller.reseller_id, tenantIds);

    return NextResponse.json({
      success: true,
      clientName: tenants[0].name,
      clientId: tenants[0].id,
      deletedCount: tenants.length,
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[DeleteClient] Error:', error);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}