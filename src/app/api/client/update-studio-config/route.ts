import { NextRequest, NextResponse } from 'next/server';
import { createAuthClient, getAuthenticatedUser } from '@/lib/auth/server';
import { safeParseClientWidgetStudio } from '@/lib/schemas/client-config.schema';
import { z } from 'zod';

/**
 * Client Studio Config Update Route
 * 
 * This route is INDEPENDENT from the reseller system and handles
 * client-side widget studio configuration updates.
 * 
 * No imports from reseller schemas or services.
 */

const ClientUpdateRequestSchema = z.object({
  tenantId: z.string().uuid('Invalid tenant ID'),
  studioConfig: z.record(z.unknown()).optional(),
});

export async function POST(request: NextRequest) {
  try {
    // ────────────────────────────────────────────────────────────
    // STEP 1: Authentication
    // ────────────────────────────────────────────────────────────
    const { userId, error: authError } = await getAuthenticatedUser();
    if (authError || !userId) {
      console.warn('[ClientUpdateStudio] Unauthorized');
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // ────────────────────────────────────────────────────────────
    // STEP 2: Parse and Validate Request
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

    const validation = ClientUpdateRequestSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid request', details: validation.error.flatten() },
        { status: 400 }
      );
    }

    const { tenantId, studioConfig } = validation.data;

    // ────────────────────────────────────────────────────────────
    // STEP 3: Validate Studio Config
    // ────────────────────────────────────────────────────────────
    const studioValidation = safeParseClientWidgetStudio(studioConfig);
    if (!studioValidation.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid studio config', details: studioValidation.error.flatten() },
        { status: 400 }
      );
    }

    // ────────────────────────────────────────────────────────────
    // STEP 4: Update Database (Placeholder for now)
    // ────────────────────────────────────────────────────────────
    const supabase = await createAuthClient();

    const { error: updateError } = await supabase
      .from('tenants')
      .update({
        widget_config: {
          widget_studio: studioValidation.data,
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', tenantId)
      .single();

    if (updateError) {
      console.error('[ClientUpdateStudio] Update failed:', updateError);
      return NextResponse.json(
        { success: false, error: 'Failed to update configuration' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      studioConfig: studioValidation.data,
      updatedAt: new Date().toISOString(),
    });

  } catch (error) {
    console.error('[ClientUpdateStudio] Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
