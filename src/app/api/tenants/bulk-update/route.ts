import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

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

    const { error } = await supabase
      .from('tenants')
      .update(payload)
      .in('id', targetIds);

    if (error) {
      console.error('[bulk-update] Supabase error:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, updated: targetIds.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[bulk-update] Unexpected error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
