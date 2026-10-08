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
// Mirrors supabase/migrations/20261007000001_tenant_appointments_crm_statuses.sql
// (AVAILABLE, RESERVED, CONFIRMED, LEAD + CONTACTED, ARCHIVED). That migration
// is idempotent (DROP CONSTRAINT IF EXISTS) — re-run it if CONTACTED/ARCHIVED
// updates 500 with a CHECK violation, which means it was never applied to the
// target database.
const ALLOWED_STATUSES = ['AVAILABLE', 'RESERVED', 'CONFIRMED', 'LEAD', 'CONTACTED', 'ARCHIVED'] as const;
type AppointmentStatus = typeof ALLOWED_STATUSES[number];

// Editable detail columns on tenant_appointments. Kept as a const union so
// the PATCH handler can validate the caller's requested fields against the
// real schema instead of passing arbitrary keys through to Supabase (which
// would surface as a 400/500 from PostgREST on an unknown column).
// Only columns proven to exist in supabase/migrations are listed:
//   003_pre_baseline_tenant_appointments.sql → client_name, client_phone
//   20261007000002_tenant_appointment_lead_capture.sql → initial_intent
const APPOINTMENT_DETAIL_COLUMNS = [
  'client_name',
  'client_phone',
  'initial_intent',
] as const;

const PatchSchema = z.object({
  id: z.string().uuid('id must be a valid UUID'),
  status: z.enum(ALLOWED_STATUSES).optional(),
  tenantId: z.string().min(1, 'tenantId is required'),
  detail: z
    .record(z.string(), z.unknown())
    .superRefine((record, ctx) => {
      for (const key of Object.keys(record)) {
        if (!(APPOINTMENT_DETAIL_COLUMNS as readonly string[]).includes(key)) {
          ctx.addIssue({
            code: z.ZodIssueCode.unrecognized_keys,
            keys: [key],
            message: `Unknown detail column '${key}'`,
          });
        }
      }
    })
    .optional(),
});

export interface AppointmentRow {
  id: string;
  tenant_id: string | null;
  client_name: string | null;
  client_phone: string | null;
  status: AppointmentStatus | null;
  start_time: string;
  end_time: string;
  created_at: string | null;
  // Lead-capture columns. The public widget chat pipeline writes an anonymous
  // visitor's name/phone directly into the canonical client_name/client_phone
  // columns during a booking-intent conversation, so the CRM dashboard renders
  // the row immediately. initial_intent records the visitor's stated purpose.
  initial_intent: string | null;
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
      .select(
        'id, tenant_id, client_name, client_phone, status, start_time, end_time, created_at, initial_intent',
      )
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

    const { id, status, tenantId, detail } = parsed.data;

    // A PATCH with neither a status change nor any detail edits is a no-op —
    // reject it explicitly so a client bug can't silently round-trip nothing.
    if (!status && (!detail || Object.keys(detail).length === 0)) {
      return NextResponse.json(
        { error: 'Nothing to update: provide a status and/or at least one detail field' },
        { status: 400 },
      );
    }

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

    // Build the update payload from the validated fields. `detail` keys are
    // guaranteed to be real columns by the schema's superRefine, so this is
    // safe to spread directly into Supabase.
    const updatePayload: Record<string, unknown> = { ...detail };
    if (status) updatePayload.status = status;

    const { data: updated, error } = await supabaseAdmin
      .from('tenant_appointments')
      .update(updatePayload)
      .eq('id', id)
      .eq('tenant_id', tenant.id)
      .select('id, client_name, client_phone, status, initial_intent, start_time, end_time')
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
