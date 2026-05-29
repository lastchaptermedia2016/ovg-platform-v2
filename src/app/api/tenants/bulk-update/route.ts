import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * Deep merge helper — merges `source` into `target` recursively.
 * Arrays are replaced, not concatenated.
 */
function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const output = { ...target };
  for (const key of Object.keys(source)) {
    if (
      source[key] !== null &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key]) &&
      typeof target[key] === 'object' &&
      target[key] !== null &&
      !Array.isArray(target[key])
    ) {
      output[key] = deepMerge(target[key] as Record<string, unknown>, source[key] as Record<string, unknown>);
    } else {
      output[key] = source[key];
    }
  }
  return output;
}

export async function POST(req: NextRequest) {
  try {
    const { targetIds, payload } = await req.json() as {
      targetIds: string[];
      payload: Record<string, unknown>;
    };

    if (!Array.isArray(targetIds) || targetIds.length === 0) {
      return NextResponse.json({ error: 'targetIds must be a non-empty array' }, { status: 400 });
    }

    const supabase = await createClient();

    // Read existing widget_config for the first target to merge safely
    // All targets should share a compatible structure; we fetch the first as a representative.
    const { data: existingTenants, error: fetchError } = await supabase
      .from('tenants')
      .select('id, widget_config')
      .in('id', targetIds);

    if (fetchError) {
      console.error('[bulk-update] Fetch error:', fetchError.message);
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    // Build per-tenant merged widget_config so each tenant preserves its unique state
    const updates = targetIds.map((id) => {
      const existing = existingTenants?.find((t: { id: string; widget_config?: Record<string, unknown> }) => t.id === id);
      const currentWidgetConfig = (existing?.widget_config as Record<string, unknown> | undefined) || {};

      return {
        id,
        widget_config: deepMerge(currentWidgetConfig, payload),
        updated_at: new Date().toISOString(),
      };
    });

    // Apply updates one by one (bulk with per-tenant merges requires iteration)
    let updatedCount = 0;
    const errors: string[] = [];

    for (const update of updates) {
      const { error: updateError } = await supabase
        .from('tenants')
        .update({ widget_config: update.widget_config, updated_at: update.updated_at })
        .eq('id', update.id);

      if (updateError) {
        errors.push(`Tenant ${update.id}: ${updateError.message}`);
        console.error(`[bulk-update] Error updating tenant ${update.id}:`, updateError.message);
      } else {
        updatedCount++;
      }
    }

    if (errors.length > 0 && updatedCount === 0) {
      return NextResponse.json({ error: 'All updates failed', details: errors }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      updated: updatedCount,
      total: targetIds.length,
      ...(errors.length > 0 ? { partialErrors: errors } : {}),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[bulk-update] Unexpected error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}