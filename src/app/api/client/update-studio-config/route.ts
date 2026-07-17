import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth/server';
import { z } from 'zod';
import { dispatchAction, ActionContext, ActionResult } from '@/lib/actionRegistry';
import { safeParseClientWidgetStudio } from '@/lib/schemas/client-config.schema';
import { checkTenantAiExecutePermission } from '@/lib/checkTenantAiExecutePermission';

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
  source: z.enum(['manual', 'hannah']).optional().default('manual'),
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

    const { tenantId, studioConfig, source } = validation.data;

    // ────────────────────────────────────────────────────────────
    // STEP 2.5: Permission check for hannah-triggered updates
    // ────────────────────────────────────────────────────────────
    if (source === 'hannah') {
      const hasPermission = await checkTenantAiExecutePermission(tenantId);
      if (!hasPermission) {
        console.warn('[ClientUpdateStudio] Hannah lacks canExecute permission for tenant:', tenantId);
        return NextResponse.json(
          { success: false, error: 'AI does not have permission to modify configuration for this account' },
          { status: 403 }
        );
      }
    }

    // ────────────────────────────────────────────────────────────
    // STEP 3: Validate studioConfig with safeParseClientWidgetStudio
    // ────────────────────────────────────────────────────────────
    const studioValidation = safeParseClientWidgetStudio(studioConfig ?? {});
    if (!studioValidation.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid studio configuration', details: studioValidation.error.flatten() },
        { status: 400 }
      );
    }

    const validatedParams = studioValidation.data;

    // ────────────────────────────────────────────────────────────
    // STEP 4: Dispatch action via ActionRegistry
    // ────────────────────────────────────────────────────────────
    const ctx: ActionContext = {
      userId,
      tenantId,
      source,
    };

    const result: ActionResult = await dispatchAction('updateStudioConfig', validatedParams, ctx);

    return NextResponse.json({
      success: result.success,
      studioConfig: validatedParams,
      updatedAt: new Date().toISOString(),
      error: result.error,
      partialFailure: result.partialFailure,
    });

  } catch (error) {
    console.error('[ClientUpdateStudio] Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}