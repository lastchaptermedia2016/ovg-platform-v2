import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, createAuthClient } from '@/lib/auth/server';
import { resolveTenantId } from '@/lib/resolveTenantId';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { z } from 'zod';

const CreateKnowledgeSchema = z.object({
  title: z.string().min(1, 'Title is required').max(500, 'Title must be 500 characters or fewer'),
  content: z.string().min(1, 'Content is required'),
  category: z.string().max(200, 'Category must be 200 characters or fewer').optional().nullable(),
});

const DeleteKnowledgeSchema = z.object({
  id: z.string().uuid('Invalid knowledge entry ID'),
});

export async function GET() {
  try {
    // ────────────────────────────────────────────────────────────
    // STEP 1: Authenticate
    // ────────────────────────────────────────────────────────────
    const { userId, error: authError } = await getAuthenticatedUser();
    if (authError || !userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // ────────────────────────────────────────────────────────────
    // STEP 2: Resolve the active tenant
    // ────────────────────────────────────────────────────────────
    const supabase = await createAuthClient();
    const { data: tenantId, error: tenantError } = await resolveTenantId(userId, supabase);
    if (tenantError || !tenantId) {
      console.warn('[ClientKnowledge] No tenant resolved for user', userId, tenantError?.message);
      return NextResponse.json(
        { success: false, error: 'No tenant associated with this account' },
        { status: 403 }
      );
    }

    // ────────────────────────────────────────────────────────────
    // STEP 3: Fetch knowledge entries for the tenant
    // ────────────────────────────────────────────────────────────
    const { data, error } = await supabaseAdmin
      .from('tenant_knowledge')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[ClientKnowledge] Fetch failed:', error.message);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch knowledge base' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    console.error('[ClientKnowledge] Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // ────────────────────────────────────────────────────────────
    // STEP 1: Authenticate
    // ────────────────────────────────────────────────────────────
    const { userId, error: authError } = await getAuthenticatedUser();
    if (authError || !userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // ────────────────────────────────────────────────────────────
    // STEP 2: Resolve the active tenant
    // ────────────────────────────────────────────────────────────
    const supabase = await createAuthClient();
    const { data: tenantId, error: tenantError } = await resolveTenantId(userId, supabase);
    if (tenantError || !tenantId) {
      console.warn('[ClientKnowledge] No tenant resolved for user', userId, tenantError?.message);
      return NextResponse.json(
        { success: false, error: 'No tenant associated with this account' },
        { status: 403 }
      );
    }

    // ────────────────────────────────────────────────────────────
    // STEP 3: Parse and validate JSON body
    // ────────────────────────────────────────────────────────────
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON' },
        { status: 400 }
      );
    }

    const validation = CreateKnowledgeSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid request', details: validation.error.flatten() },
        { status: 400 }
      );
    }

    const { title, content, category } = validation.data;

    // ────────────────────────────────────────────────────────────
    // STEP 4: Insert the knowledge entry scoped to the tenant
    // ────────────────────────────────────────────────────────────
    const { data, error } = await supabaseAdmin
      .from('tenant_knowledge')
      .insert({
        tenant_id: tenantId,
        title,
        content,
        category: category ?? null,
      })
      .select()
      .single();

    if (error) {
      console.error('[ClientKnowledge] Create failed:', error.message);
      return NextResponse.json(
        { success: false, error: 'Failed to create knowledge entry' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    console.error('[ClientKnowledge] Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    // ────────────────────────────────────────────────────────────
    // STEP 1: Authenticate
    // ────────────────────────────────────────────────────────────
    const { userId, error: authError } = await getAuthenticatedUser();
    if (authError || !userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // ────────────────────────────────────────────────────────────
    // STEP 2: Resolve the active tenant
    // ────────────────────────────────────────────────────────────
    const supabase = await createAuthClient();
    const { data: tenantId, error: tenantError } = await resolveTenantId(userId, supabase);
    if (tenantError || !tenantId) {
      console.warn('[ClientKnowledge] No tenant resolved for user', userId, tenantError?.message);
      return NextResponse.json(
        { success: false, error: 'No tenant associated with this account' },
        { status: 403 }
      );
    }

    // ────────────────────────────────────────────────────────────
    // STEP 3: Parse and validate JSON body
    // ────────────────────────────────────────────────────────────
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON' },
        { status: 400 }
      );
    }

    const validation = DeleteKnowledgeSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid request', details: validation.error.flatten() },
        { status: 400 }
      );
    }

    const { id } = validation.data;

    // ────────────────────────────────────────────────────────────
    // STEP 4: Delete only if the entry belongs to the tenant
    // ────────────────────────────────────────────────────────────
    const { error } = await supabaseAdmin
      .from('tenant_knowledge')
      .delete()
      .eq('id', id)
      .eq('tenant_id', tenantId);

    if (error) {
      console.error('[ClientKnowledge] Delete failed:', error.message);
      return NextResponse.json(
        { success: false, error: 'Failed to delete knowledge entry' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[ClientKnowledge] Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ──────────────────────────────────────────────
// Unsupported methods
// ──────────────────────────────────────────────
export async function PUT() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}

export async function PATCH() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}
