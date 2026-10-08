import { supabaseAdmin } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';
import { normalizeVisitorPhone, normalizeVisitorEmail } from '@/lib/ai/memory-service';

const MEMORY_FALLBACK = {
  client_name: 'Unknown',
  company_name: 'Unknown',
  preferences: 'None recorded',
} as const;

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

async function resolveTenant(tenantId: string) {
  const byTenantId = await supabaseAdmin
    .from('tenants')
    .select('id')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  const byId = await supabaseAdmin
    .from('tenants')
    .select('id')
    .eq('id', tenantId)
    .maybeSingle();
  const tenant = byTenantId.data ?? byId.data;

  if (!tenant) {
    console.warn('[visitor-memories] tenant not found:', { tenantId, byTenantIdError: byTenantId.error, byIdError: byId.error });
    return null;
  }

  return tenant;
}

function buildMemories(data: { memory_key: string; memory_value: string }[] | null) {
  const memories = { ...MEMORY_FALLBACK };
  if (data && Array.isArray(data)) {
    for (const row of data) {
      if (row?.memory_key && typeof row.memory_value === 'string') {
        (memories as Record<string, string>)[row.memory_key] = row.memory_value;
      }
    }
  }
  return memories;
}

export async function POST(request: NextRequest) {
  let body: { phone?: string; email?: string; tenantId?: string; visitorName?: string; initialIntent?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { phone, email, tenantId, visitorName, initialIntent } = body;

  if (!tenantId || typeof tenantId !== 'string' || !isUuid(tenantId)) {
    return NextResponse.json({ error: 'Invalid tenantId' }, { status: 400 });
  }

  const normPhone = normalizeVisitorPhone(phone);
  const normEmail = normalizeVisitorEmail(email);

  if (!normPhone && !normEmail) {
    return NextResponse.json({ ...MEMORY_FALLBACK });
  }

  try {
    const tenant = await resolveTenant(tenantId);
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    // ── CRM Lead Capture ───────────────────────────────────────────────
    // Every time a visitor's contact details are submitted through this
    // endpoint, persist a LEAD row into tenant_appointments so the CRM
    // dashboard (AppointmentsDashboard) picks it up immediately. The
    // visitor_name prefers the stored client_name memory when available,
    // falling back to the explicit body field, then to a generic label.
    // Non-blocking: a DB failure never interrupts the memory read response.
    if (normPhone) {
      const identityValue = normPhone;
      const { data: nameRow } = await supabaseAdmin
        .from('visitor_memories')
        .select('memory_value')
        .eq('tenant_id', tenant.id)
        .eq('identity_type', 'phone')
        .eq('identity_value', identityValue)
        .eq('memory_key', 'client_name')
        .maybeSingle();

      const resolvedName =
        (nameRow?.memory_value as string | undefined)?.trim() ||
        visitorName?.trim() ||
        'Anonymous Visitor';

      try {
        await supabaseAdmin.from('tenant_appointments').insert({
          tenant_id: tenant.id,
          visitor_name: resolvedName,
          visitor_phone: normPhone,
          status: 'LEAD',
          initial_intent: initialIntent?.trim() || 'Public widget inquiry',
          start_time: new Date().toISOString(),
          end_time: new Date().toISOString(),
        });
      } catch {
        // Non-blocking: lead capture failure doesn't block the response
      }
    }

    const identityType = normPhone ? 'phone' : 'email';
    const identityValue = normPhone || normEmail;

    const start = Date.now();
    const { data, error } = await supabaseAdmin
      .from('visitor_memories')
      .select('memory_key, memory_value')
      .eq('tenant_id', tenant.id)
      .eq('identity_type', identityType)
      .eq('identity_value', identityValue);

    if (error) {
      console.error('[visitor-memories] query error:', error);
      return NextResponse.json({ ...MEMORY_FALLBACK });
    }

    const memories = buildMemories(data);

    const targetMs = 80;
    const remaining = targetMs - (Date.now() - start);
    if (remaining > 0) {
      await new Promise((resolve) => setTimeout(resolve, remaining));
    }

    return NextResponse.json(memories);
  } catch (err) {
    console.error('[visitor-memories] unexpected error:', err);
    return NextResponse.json({ ...MEMORY_FALLBACK });
  }
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const tenantSlug = url.searchParams.get('tenantSlug');
  const tenantId = url.searchParams.get('tenantId');
  const identifier = url.searchParams.get('identifier');

  if (!identifier) {
    return NextResponse.json({ error: 'Missing identifier query parameter' }, { status: 400 });
  }

  const resolvedTenantId = tenantSlug || tenantId;
  if (!resolvedTenantId || typeof resolvedTenantId !== 'string') {
    return NextResponse.json({ error: 'Missing tenantSlug or tenantId query parameter' }, { status: 400 });
  }

  const normPhone = normalizeVisitorPhone(identifier);
  const normEmail = normalizeVisitorEmail(identifier);

  if (!normPhone && !normEmail) {
    return NextResponse.json({ ...MEMORY_FALLBACK });
  }

  try {
    const tenant = await resolveTenant(resolvedTenantId);
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    const identityType = normPhone ? 'phone' : 'email';
    const identityValue = normPhone || normEmail;

    const start = Date.now();
    const { data, error } = await supabaseAdmin
      .from('visitor_memories')
      .select('memory_key, memory_value')
      .eq('tenant_id', tenant.id)
      .eq('identity_type', identityType)
      .eq('identity_value', identityValue);

    if (error) {
      console.error('[visitor-memories] query error:', error);
      return NextResponse.json({ ...MEMORY_FALLBACK });
    }

    const memories = buildMemories(data);

    const targetMs = 80;
    const remaining = targetMs - (Date.now() - start);
    if (remaining > 0) {
      await new Promise((resolve) => setTimeout(resolve, remaining));
    }

    return NextResponse.json(memories);
  } catch (err) {
    console.error('[visitor-memories] unexpected error:', err);
    return NextResponse.json({ ...MEMORY_FALLBACK });
  }
}