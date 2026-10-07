/**
 * @file route.ts
 *
 * Appointment Requests API
 *
 * Serves and manages `tenant_appointments` LEAD rows captured by the public
 * AI chat widget. All reads and writes are scoped to the authenticated user's
 * tenant via the canonical `user_resellers` join (consistent with the RLS
 * pattern used across this repo).
 *
 * GET  /api/appointments?tenantId=...   — paginated list of appointment rows
 * PATCH /api/appointments               — update status of a single row
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getTenantBySlug } from '@/core/tenant/db';
import { getUserFromRequest } from '@/lib/auth/server';
import { z } from 'zod';

// ── Allowed status values (from the live CHECK constraint) ─────────────────
const ALLOWED_STATUSES = ['AVAILABLE', 'RESERVED', 'CONFIRMED', 'LEAD', 'CONTACTED', 'ARCHIVED'] as const;
type AppointmentStatus = typeof ALLOWED_STATUSES[number];

const PatchSchema = z.object({
  id: z.string().uuid('id must be a valid UUID'),
  status: z.enum(ALLOWED_STATUSES),
  tenantId: z.string().min(1, 'tenantId is required'),
});

export interface AppointmentRow {
  id: string;
  tenant_id: string | null;
  client_name: string | null;
  client_phone: string | null;
  status: AppointmentStatus | null;
  notes: string | null;
  treatment: string | null;
  preferred_date: string | null;
  preferred_time: string | null;
  start_time: string;
  end_time: string;
  created_at: string | null;
}

// ── GET — list appointments for a tenant ──────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const tenantId = request.nextUrl.searchParams.get('tenantId');
    if (!tenantId) {
      return NextResponse.json({ error: 'tenantId is required' }, { status: 400 });
    }

    const { user } = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const tenant = await getTenantBySlug(tenantId, supabaseAdmin);
    if (!tenant) {
      return NextResponse.json({ error: 'Unknown tenant' }, { status: 404 });
    }

    // Verify the authenticated user belongs to this tenant's reseller
    const { data: membership } = await supabaseAdmin
      .from('user_resellers')
      .select('reseller_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!membership || membership.reseller_id !== tenant.reseller_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data: appointments, error } = await supabaseAdmin
      .from('tenant_appointments')
      .select('id, tenant_id, client_name, client_phone, status, start_time, end_time, created_at')
      .eq('tenant_id', tenant.id)
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) {
      console.error('[API_APPOINTMENTS_GET_ERROR]:', error);
      return NextResponse.json({ error: 'Failed to fetch appointments' }, { status: 500 });
    }

    return NextResponse.json({ appointments: appointments ?? [] });
  } catch (err) {
    console.error('[API_APPOINTMENTS_GET_UNEXPECTED]:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ── PATCH — update a single appointment's status ──────────────────────────
export async function PATCH(request: NextRequest) {
  try {
    const { user } = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: unknown = await request.json();
    const parsed = PatchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { id, status, tenantId } = parsed.data;

    const tenant = await getTenantBySlug(tenantId, supabaseAdmin);
    if (!tenant) {
      return NextResponse.json({ error: 'Unknown tenant' }, { status: 404 });
    }

    // Verify ownership before mutating
    const { data: membership } = await supabaseAdmin
      .from('user_resellers')
      .select('reseller_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!membership || membership.reseller_id !== tenant.reseller_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data: updated, error } = await supabaseAdmin
      .from('tenant_appointments')
      .update({ status })
      .eq('id', id)
      .eq('tenant_id', tenant.id)
      .select('id, status')
      .maybeSingle();

    if (error) {
      console.error('[API_APPOINTMENTS_PATCH_ERROR]:', error);
      return NextResponse.json({ error: 'Failed to update appointment' }, { status: 500 });
    }

    if (!updated) {
      return NextResponse.json({ error: 'Appointment not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, appointment: updated });
  } catch (err) {
    console.error('[API_APPOINTMENTS_PATCH_UNEXPECTED]:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
