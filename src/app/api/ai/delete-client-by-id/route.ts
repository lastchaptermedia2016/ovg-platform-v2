import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { deleteResellerTenant } from '@/lib/db/reseller-clients';
import { resolveResellerId } from '@/lib/supabase/resolve-reseller-id';

export const dynamic = 'force-dynamic';

/**
 * DELETE_CLIENT_BY_ID
 * 
 * Lightweight deletion endpoint called by the frontend hook after the
 * orchestrator has resolved a client name to a UUID. Performs ownership
 * verification on every request to guarantee multi-tenant isolation.
 *
 * @body { tenantId: string; resellerSlug: string }
 * @returns { success: true; clientName: string; clientId: string } | { error: string }
 */

// Zod-lite runtime validation to avoid heavy imports in edge routes
function validateBody(body: unknown): { tenantId: string; resellerSlug: string } | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  if (
    typeof b.tenantId !== 'string' || b.tenantId.trim().length === 0 ||
    typeof b.resellerSlug !== 'string' || b.resellerSlug.trim().length === 0
  ) {
    return null;
  }
  return { tenantId: b.tenantId.trim(), resellerSlug: b.resellerSlug.trim() };
}

export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Validate request body
    const rawBody = await request.json();
    const validated = validateBody(rawBody);
    if (!validated) {
      return NextResponse.json(
        { error: 'Invalid request: tenantId and resellerSlug are required' },
        { status: 400 }
      );
    }

    const { tenantId, resellerSlug } = validated;

    // 3. Resolve reseller slug → UUID for ownership check
    const resolvedResellerId = await resolveResellerId(supabase, resellerSlug);
    if (!resolvedResellerId) {
      return NextResponse.json(
        { error: 'Reseller not found' },
        { status: 404 }
      );
    }

    // 4. Fetch the tenant to verify it exists and belongs to this reseller
    const { data: tenant, error: fetchError } = await supabase
      .from('tenants')
      .select('id, name, reseller_id')
      .eq('id', tenantId)
      .single();

    if (fetchError || !tenant) {
      // PGRST116 = row not found (PostgREST)
      if (fetchError?.code === 'PGRST116' || !tenant) {
        return NextResponse.json(
          { error: 'Client not found' },
          { status: 404 }
        );
      }
      console.error('[DeleteClientById] Fetch error:', fetchError);
      return NextResponse.json(
        { error: 'Failed to verify client' },
        { status: 500 }
      );
    }

    // 5. Ownership guard: ensure the tenant belongs to the calling reseller
    if (tenant.reseller_id !== resolvedResellerId) {
      console.error('[DeleteClientById] Ownership mismatch:', {
        tenantReseller: tenant.reseller_id,
        callerReseller: resolvedResellerId,
      });
      return NextResponse.json(
        { error: 'Forbidden: client not owned by this reseller' },
        { status: 403 }
      );
    }

    // 6. Execute deletion
    await deleteResellerTenant(resolvedResellerId, tenantId);

    // 7. Return success with the client name for TTS confirmation
    return NextResponse.json({
      success: true,
      clientName: tenant.name,
      clientId: tenant.id,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[DeleteClientById] Unexpected error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Handle unsupported methods
export async function GET() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}

export async function PUT() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}

export async function DELETE() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}