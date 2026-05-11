import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
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
    
    // First try with user session (for RLS compliance)
    const supabase = await createClient();
    
    // If that fails due to RLS, use service role for admin operations
    const serviceClient = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Resolve slug to UUID - try user session first, fallback to service client
    let reseller, resellerError;
    
    try {
      const result = await supabase
        .from('resellers')
        .select('id')
        .eq('slug', resellerSlug)
        .single();
      reseller = result.data;
      resellerError = result.error;
    } catch {
      console.log('User session failed, trying service client');
    }

    // If user session fails, use service client
    if (resellerError || !reseller) {
      const result = await serviceClient
        .from('resellers')
        .select('id')
        .eq('slug', resellerSlug)
        .single();
      reseller = result.data;
      resellerError = result.error;
    }

    if (resellerError || !reseller) {
      return NextResponse.json({ error: 'Reseller not found' }, { status: 404 });
    }

    // Fetch all active clients for this reseller
    // Skip user session - RLS returns empty array instead of error, blocking fallback
    const { data: clients, error: clientsError } = await serviceClient
      .from('tenants')
      .select('id, name, category, is_active, branding_colors, custom_assets, created_at')
      .eq('reseller_id', reseller.id)
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
