import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, validateTenantOwnership } from '@/lib/auth/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { z } from 'zod';

const KnowledgeIdSchema = z.string().uuid('Invalid knowledge entry ID');

const UpdateKnowledgeSchema = z
  .object({
    title: z.string().min(1).max(500).optional(),
    content: z.string().min(1).optional(),
    category: z.string().max(200).nullable().optional(),
    is_active: z.boolean().optional(),
  })
  .refine(
    (value) => Object.keys(value).length > 0,
    'At least one field (title, content, category, is_active) is required',
  );

/** Consistent error payload shape per Phase 4.2 contract: `{ error: string }`. */
function errorResponse(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

function zodErrorMessage(error: z.ZodError): string {
  return error.issues.map((issue) => issue.message).join('; ');
}

/**
 * Loads the target row's id + tenant_id so authorization can be derived from
 * the row itself (404 when missing) before any write is issued.
 */
async function loadRowForCaller(
  id: string,
): Promise<{ tenantId: string } | { failure: NextResponse }> {
  const { data, error } = await supabaseAdmin
    .from('tenant_knowledge')
    .select('id, tenant_id')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    console.error('[TenantKnowledge] Row lookup failed:', error.message);
    return { failure: errorResponse('Failed to load knowledge entry', 500) };
  }
  if (!data) {
    return { failure: errorResponse('Knowledge entry not found', 404) };
  }
  const row = data as { id: string; tenant_id: string };
  return { tenantId: row.tenant_id };
}

// PATCH /api/reseller/tenant-knowledge/[id]
// Body: partial { title, content, category, is_active } — scoped by the row's
// tenant_id, which the caller must be authorized to manage.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { userId, error: authError } = await getAuthenticatedUser();
    if (authError || !userId) {
      return errorResponse('Unauthorized', 401);
    }

    const { id } = await params;
    if (!KnowledgeIdSchema.safeParse(id).success) {
      return errorResponse('Invalid knowledge entry ID', 400);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse('Invalid JSON', 400);
    }

    const parsed = UpdateKnowledgeSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(`Invalid request: ${zodErrorMessage(parsed.error)}`, 400);
    }

    // Resolve tenant scope from the row (404 when it does not exist).
    const resolved = await loadRowForCaller(id);
    if ('failure' in resolved) return resolved.failure;

    // Tenant isolation: caller must manage the row's tenant.
    const ownership = await validateTenantOwnership(userId, resolved.tenantId);
    if (!ownership) {
      return errorResponse('Forbidden: You do not manage this tenant', 403);
    }

    const { data: updated, error: updateError } = await supabaseAdmin
      .from('tenant_knowledge')
      .update(parsed.data)
      .eq('id', id)
      .eq('tenant_id', resolved.tenantId)
      .select()
      .maybeSingle();

    if (updateError) {
      console.error('[TenantKnowledge] PATCH failed:', updateError.message);
      return errorResponse('Failed to update knowledge entry', 500);
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (err: unknown) {
    console.error('[TenantKnowledge] PATCH unexpected error:', err);
    return errorResponse('Internal server error', 500);
  }
}

// DELETE /api/reseller/tenant-knowledge/[id]?permanent=true
// Default: soft-delete (is_active = false). ?permanent=true: hard delete.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { userId, error: authError } = await getAuthenticatedUser();
    if (authError || !userId) {
      return errorResponse('Unauthorized', 401);
    }

    const { id } = await params;
    if (!KnowledgeIdSchema.safeParse(id).success) {
      return errorResponse('Invalid knowledge entry ID', 400);
    }

    const permanent = request.nextUrl.searchParams.get('permanent') === 'true';

    // Resolve tenant scope from the row (404 when it does not exist).
    const resolved = await loadRowForCaller(id);
    if ('failure' in resolved) return resolved.failure;

    // Tenant isolation: caller must manage the row's tenant.
    const ownership = await validateTenantOwnership(userId, resolved.tenantId);
    if (!ownership) {
      return errorResponse('Forbidden: You do not manage this tenant', 403);
    }

    if (permanent) {
      const { error } = await supabaseAdmin
        .from('tenant_knowledge')
        .delete()
        .eq('id', id)
        .eq('tenant_id', resolved.tenantId);

      if (error) {
        console.error('[TenantKnowledge] DELETE failed:', error.message);
        return errorResponse('Failed to delete knowledge entry', 500);
      }
      return NextResponse.json({ success: true, mode: 'permanent' });
    }

    const { error } = await supabaseAdmin
      .from('tenant_knowledge')
      .update({ is_active: false })
      .eq('id', id)
      .eq('tenant_id', resolved.tenantId);

    if (error) {
      console.error('[TenantKnowledge] Soft delete failed:', error.message);
      return errorResponse('Failed to soft-delete knowledge entry', 500);
    }
    return NextResponse.json({ success: true, mode: 'soft' });
  } catch (err: unknown) {
    console.error('[TenantKnowledge] DELETE unexpected error:', err);
    return errorResponse('Internal server error', 500);
  }
}
