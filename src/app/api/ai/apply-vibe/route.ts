import { NextRequest, NextResponse } from 'next/server';
import { applyVibe, ApplyVibeRequestSchema } from '@/lib/ai/apply-vibe';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = ApplyVibeRequestSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: validation.error.flatten() },
        { status: 400 }
      );
    }

    // Generation logic lives in @/lib/ai/apply-vibe so server routes can
    // invoke it in-process (no internal HTTP loop).
    const { widgetConfig, metadata } = await applyVibe(validation.data);

    return NextResponse.json({
      success: true,
      widgetConfig,
      metadata,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to apply AI vibe';
    console.error('❌ Apply Vibe error:', error);
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405 }
  );
}
