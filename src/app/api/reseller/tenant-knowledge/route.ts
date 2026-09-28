import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, validateTenantOwnership } from '@/lib/auth/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { z } from 'zod';

const CreateTenantKnowledgeSchema = z.object({
  tenantId: z.string().uuid('Invalid tenant ID'),
  title: z.string().min(1, 'Title is required').max(500, 'Title must be 500 characters or fewer'),
  content: z.string().min(1, 'Content is required'),
  category: z.string().max(200, 'Category must be 200 characters or fewer').optional().nullable(),
  isActive: z.boolean().optional(),
});

const TenantIdQuerySchema = z.object({
  tenantId: z.string().uuid('Invalid tenant ID'),
});

/** Consistent error payload shape per Phase 4.2 contract: `{ error: string }`. */
function errorResponse(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

function zodErrorMessage(error: z.ZodError): string {
  return error.issues.map((issue) => issue.message).join('; ');
}

// GET /api/reseller/tenant-knowledge?tenantId=<tenant_id>
// Returns all knowledge records for a tenant the caller is authorized to manage.
export async function GET(request: NextRequest) {
  try {
    // STEP 1: Authenticate
    const { userId, error: authError } = await getAuthenticatedUser();
    if (authError || !userId) {
      return errorResponse('Unauthorized', 401);
    }

    // STEP 2: Resolve + validate tenantId from query parameters
    const rawTenantId = (request.nextUrl.searchParams.get('tenantId') ?? '').trim();
    const parsedTenant = TenantIdQuerySchema.safeParse({ tenantId: rawTenantId });
    if (!parsedTenant.success) {
      return errorResponse('tenantId is required and must be a valid UUID', 400);
    }
    const tenantId = parsedTenant.data.tenantId;

    // STEP 3: Validate reseller ownership of the target tenant
    const ownership = await validateTenantOwnership(userId, tenantId);
    if (!ownership) {
      return errorResponse('Forbidden: You do not manage this tenant', 403);
    }

    // STEP 4: Fetch knowledge entries — always scoped by tenant_id
    const { data, error } = await supabaseAdmin
      .from('tenant_knowledge')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[TenantKnowledge] GET failed:', error.message);
      return errorResponse('Failed to fetch knowledge base', 500);
    }

    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (err: unknown) {
    console.error('[TenantKnowledge] GET unexpected error:', err);
    return errorResponse('Internal server error', 500);
  }
}

// POST /api/reseller/tenant-knowledge
// Body: { tenantId, title, content, category?, isActive? } → 201 + created row.
export async function POST(request: NextRequest) {
  try {
    // STEP 1: Authenticate
    const { userId, error: authError } = await getAuthenticatedUser();
    if (authError || !userId) {
      return errorResponse('Unauthorized', 401);
    }

    // STEP 2: Parse + validate JSON body
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse('Invalid JSON', 400);
    }

    const parsed = CreateTenantKnowledgeSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(`Invalid request: ${zodErrorMessage(parsed.error)}`, 400);
    }
    const { tenantId, title, content, category, isActive } = parsed.data;

    // STEP 3: Validate reseller ownership of the target tenant
    const ownership = await validateTenantOwnership(userId, tenantId);
    if (!ownership) {
      return errorResponse('Forbidden: You do not manage this tenant', 403);
    }

    // STEP 4: Insert — row is stamped with the validated tenant_id only
    const { data, error } = await supabaseAdmin
      .from('tenant_knowledge')
      .insert({
        tenant_id: tenantId,
        title,
        content,
        category: category ?? null,
        is_active: isActive ?? true,
      })
      .select()
      .single();

    if (error) {
      console.error('[TenantKnowledge] POST failed:', error.message);
      return errorResponse('Failed to create knowledge entry', 500);
    }

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (err: unknown) {
    console.error('[TenantKnowledge] POST unexpected error:', err);
    return errorResponse('Internal server error', 500);
  }
}
