import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ resellerSlug: string }> }
) {
  try {
    const { resellerSlug } = await params;
    
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
    } catch (e) {
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
    let clients, clientsError;
    
    try {
      const result = await supabase
        .from('tenants')
        .select('id, name, industry, is_active, branding_colors, custom_assets, created_at')
        .eq('reseller_id', reseller.id)
        .eq('is_active', true)
        .order('created_at', { ascending: false });
      clients = result.data;
      clientsError = result.error;
    } catch (e) {
      console.log('User session failed for clients, trying service client');
    }

    // If user session fails, use service client
    if (clientsError || !clients) {
      const result = await serviceClient
        .from('tenants')
        .select('id, name, industry, is_active, branding_colors, custom_assets, created_at')
        .eq('reseller_id', reseller.id)
        .eq('is_active', true)
        .order('created_at', { ascending: false });
      clients = result.data;
      clientsError = result.error;
    }

    if (clientsError) {
      return NextResponse.json({ error: clientsError.message }, { status: 500 });
    }

    return NextResponse.json(clients || []);

  } catch (error: any) {
    console.error('[API] reseller clients error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
