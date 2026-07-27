import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth/server';
import { z } from 'zod';
import { dispatchAction, ActionContext, ActionResult } from '@/lib/actionRegistry';
import { safeParseClientWidgetStudio } from '@/lib/schemas/client-config.schema';
import { checkTenantAiExecutePermission } from '@/lib/checkTenantAiExecutePermission';

const ROUTE_TIMEOUT_MS = 45_000;
const CLIENT_FACING_TIMEOUT = 'The configuration service is temporarily unavailable. Please try again shortly.';

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

    const result: ActionResult = await withRetry(
      () => dispatchAction('updateStudioConfig', validatedParams, ctx),
      { retries: 1, baseDelayMs: 400 }
    );

    return NextResponse.json({
      success: result.success,
      studioConfig: validatedParams,
      updatedAt: new Date().toISOString(),
      error: result.error,
      partialFailure: result.partialFailure,
    });

  } catch (error) {
    const message = sanitizeErrorMessage(
      error instanceof Error ? error.message : 'Internal server error'
    );
    console.error('[ClientUpdateStudio] Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

function sanitizeErrorMessage(message: string): string {
  if (message.includes('<!DOCTYPE html>') || message.includes('<html') || message.includes('520:')) {
    return CLIENT_FACING_TIMEOUT;
  }
  return message;
}

async function withRetry<T>(operation: () => Promise<T>, options: { retries: number; baseDelayMs: number }): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= options.retries; attempt++) {
    try {
      return await raceWithTimeout(operation(), ROUTE_TIMEOUT_MS);
    } catch (error) {
      lastError = error;
      if (attempt === options.retries) break;
      const delay = options.baseDelayMs * 2 ** attempt;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function raceWithTimeout<T>(operation: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(CLIENT_FACING_TIMEOUT)), ms);
    operation.then(value => {
      clearTimeout(timer);
      resolve(value);
    }).catch(err => {
      clearTimeout(timer);
      reject(err);
    });
  });
}