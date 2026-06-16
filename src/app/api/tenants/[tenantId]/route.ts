import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// ──────────────────────────────────────────────
// Double-lock ownership verification
// Validates that authenticated user owns/reseller for the tenant
// ──────────────────────────────────────────────
async function validateTenantOwnership(
  userId: string,
  tenantId: string,
): Promise<{ resellerId: string } | null> {
  const supabase = await createClient();

  // Resolve tenant to get its reseller_id
  const { data: tenant, error } = await supabase
    .from("tenants")
    .select("reseller_id")
    .eq("id", tenantId)
    .single();

  if (error || !tenant?.reseller_id) {
    return null;
  }

  // Verify user has access to this reseller via user_resellers junction
  const { data: userReseller } = await supabase
    .from("user_resellers")
    .select("reseller_id")
    .eq("user_id", userId)
    .eq("reseller_id", tenant.reseller_id)
    .maybeSingle();

  if (!userReseller) {
    return null;
  }

  return { resellerId: tenant.reseller_id };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  try {
    // ── STEP 1: Session Validation ─────────────────
    const supabase = await createClient();
    const { data: { session }, error: authError } = await supabase.auth.getSession();

    if (authError || !session) {
      return NextResponse.json({ error: 'Unauthorized access path' }, { status: 401 });
    }

    // ── STEP 2: Extract and validate tenant access ───
    const { tenantId } = await params;

    // ── STEP 3: Double-lock ownership verification ──
    const ownership = await validateTenantOwnership(session.user.id, tenantId);

    if (!ownership) {
      return NextResponse.json({ error: 'Forbidden - tenant access denied' }, { status: 403 });
    }

    // ── STEP 4: Scoped query with explicit reseller context ──
    const { data: tenant, error } = await supabase
      .from('tenants')
      .select('*')
      .eq('id', tenantId)
      .eq('reseller_id', ownership.resellerId)
      .single();

    if (error || !tenant) {
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
    // ── STEP 1: Session Validation ─────────────────
    const supabase = await createClient();
    const { data: { session }, error: authError } = await supabase.auth.getSession();

    if (authError || !session) {
      return NextResponse.json({ error: 'Unauthorized access path' }, { status: 401 });
    }

    // ── STEP 2: Extract and validate tenant access ───
    const { tenantId } = await params;
    const body = await request.json();

    // ── STEP 3: Double-lock ownership verification ──
    const ownership = await validateTenantOwnership(session.user.id, tenantId);

    if (!ownership) {
      return NextResponse.json({ error: 'Forbidden - tenant access denied' }, { status: 403 });
    }

    // ── STEP 4: Scoped mutation with explicit reseller context ──
    const { data, error } = await supabase
      .from('tenants')
      .update(body)
      .eq('id', tenantId)
      .eq('reseller_id', ownership.resellerId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[API] tenant update error:', error);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}