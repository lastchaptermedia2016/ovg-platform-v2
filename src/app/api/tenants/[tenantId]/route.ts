import { NextRequest, NextResponse } from 'next/server';
import { createAuthClient, getAuthenticatedUser, unauthorizedResponse, validateTenantOwnership } from '@/lib/auth/server';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  try {
    // ── STEP 1: Authenticate user ───────────────────
    const { userId, error } = await getAuthenticatedUser();
    if (error || !userId) return unauthorizedResponse();

    // ── STEP 2: Extract and validate tenant access ───
    const { tenantId } = await params;
    const supabase = await createAuthClient();

    // ── STEP 3: Double-lock ownership verification ──
    const ownership = await validateTenantOwnership(userId, tenantId);

    if (!ownership) {
      return NextResponse.json({ error: 'Forbidden - tenant access denied' }, { status: 403 });
    }

    // ── STEP 4: Scoped query with explicit reseller context ──
    const { data: tenant, error: fetchError } = await supabase
      .from('tenants')
      .select('*')
      .eq('id', tenantId)
      .eq('reseller_id', ownership.resellerId)
      .single();

    if (fetchError || !tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    return NextResponse.json(tenant);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[API] tenant fetch error:', error);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  try {
    // ── STEP 1: Authenticate user ───────────────────
    const { userId, error } = await getAuthenticatedUser();
    if (error || !userId) return unauthorizedResponse();

    // ── STEP 2: Extract and validate tenant access ───
    const { tenantId } = await params;
    const body = await request.json();
    const supabase = await createAuthClient();

    // ── STEP 3: Double-lock ownership verification ──
    const ownership = await validateTenantOwnership(userId, tenantId);

    if (!ownership) {
      return NextResponse.json({ error: 'Forbidden - tenant access denied' }, { status: 403 });
    }

    // ── STEP 4: Scoped mutation with explicit reseller context ──
    const { data, error: updateError } = await supabase
      .from('tenants')
      .update(body)
      .eq('id', tenantId)
      .eq('reseller_id', ownership.resellerId)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json(data);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[API] tenant update error:', error);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}