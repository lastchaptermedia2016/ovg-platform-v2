import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { resolveResellerId } from '@/lib/db/resolve-reseller';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

// Production Excellence: Zod schema for parameter validation
const ResellerSlugSchema = z.object({
  resellerSlug: z.string().min(1).regex(/^[a-zA-Z0-9-_]+$/, {
    message: 'Reseller slug must contain only alphanumeric characters, hyphens, and underscores'
  })
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ resellerSlug: string }> }
) {
  try {
    const paramsData = await params;
    
    // Validate resellerSlug parameter
    const validationResult = ResellerSlugSchema.safeParse(paramsData);
    if (!validationResult.success) {
      console.error('[ResellerClients] Parameter validation error:', validationResult.error.flatten());
      return NextResponse.json({ 
        error: 'Invalid reseller slug', 
        details: validationResult.error.flatten() 
      }, { status: 400 });
    }

    const { resellerSlug } = validationResult.data;
    
    // Resolve slug to UUID — Sequential lookup: try slug first, then tenant_id
    const supabase = await createClient();
    let resolvedId = await resolveResellerId(supabase, resellerSlug);

    // Fallback to service-role client if user-session resolution fails
    if (!resolvedId) {
      resolvedId = await resolveResellerId(supabaseAdmin, resellerSlug);
    }

    if (!resolvedId) {
      return NextResponse.json({ error: 'Reseller not found' }, { status: 404 });
    }

    // Fetch all active clients for this reseller
    // Skip user session - RLS returns empty array instead of error, blocking fallback
    const { data: clients, error: clientsError } = await supabaseAdmin
      .from('tenants')
      .select('id, name, category, is_active, branding_colors, custom_assets, created_at')
      .eq('reseller_id', resolvedId)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (clientsError) {
      return NextResponse.json({ error: clientsError.message }, { status: 500 });
    }

    return NextResponse.json(clients || []);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[API] reseller clients error:', error);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
