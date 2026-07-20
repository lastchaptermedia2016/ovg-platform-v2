import { supabaseAdmin } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const expected = `Bearer ${process.env.CRON_SECRET}`;

  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { data, error } = await supabaseAdmin.rpc('cleanup_expired_visitor_memories', {
      p_retention_days: 365,
    });

    if (error) {
      console.error('[cron/cleanup-memories] RPC error:', error);
      return NextResponse.json(
        { error: 'Cleanup failed', details: error },
        { status: 500 },
      );
    }

    const deleted = (data as number[] | null)?.[0] ?? 0;
    return NextResponse.json({ deleted });
  } catch (err) {
    console.error('[cron/cleanup-memories] Unexpected error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
