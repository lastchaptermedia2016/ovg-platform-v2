import { NextRequest, NextResponse } from 'next/server';
import { createAuthClient, getAuthenticatedUser, unauthorizedResponse, validateTenantOwnership } from '@/lib/auth/server';
import { deepMerge } from '@/lib/utils/deep-merge';
import { WidgetConfigSchema, type WidgetConfig } from '@/lib/schemas/tenant-config.schema';
import { logConfigChange } from '@/lib/audit/logger';
import { z } from 'zod';

/**
 * Request validation schema for tenant config updates.
 * Accepts a tenantId and an optional partial widget_config update.
 * The widgetConfig is a partial update that will be deep-merged with existing config.
 */
const UpdateConfigRequestSchema = z.object({
  tenantId: z.string().uuid('Invalid tenant ID format'),
  widgetConfig: WidgetConfigSchema.partial().optional().describe(
    'Partial widget configuration to merge with existing config'
  ),
});

/**
 * Helper: Extracts user's IP from request headers.
 * Attempts multiple header sources for reliability across different proxies.
 */
function getUserIp(request: NextRequest): string | null {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    request.headers.get('cf-connecting-ip') ||
    null
  );
}

/**
 * Helper: Extracts user email from Supabase session.
 */
async function getUserEmail(supabase: Awaited<ReturnType<typeof createAuthClient>>): Promise<string | null> {
  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return null;
    return user.email ?? null;
  } catch {
    return null;
  }
}

// ──────────────────────────────────────────────────────────────
// POST — Refactored tenant config update with deep merge & audit
// ──────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  console.warn('[Deprecated] /api/tenants/update-config is deprecated. Use /api/client/update-studio-config instead.');
  try {
    // ────────────────────────────────────────────────────────────
    // STEP 1: Authentication & Authorization
    // ────────────────────────────────────────────────────────────
    const { userId, email: authEmail, error: authError } = await getAuthenticatedUser();
    if (authError || !userId) {
      console.warn('[UpdateConfig] Unauthorized: auth check failed');
      return unauthorizedResponse();
    }

    const supabase = await createAuthClient();

    // ────────────────────────────────────────────────────────────
    // STEP 2: Request Validation
    // ────────────────────────────────────────────────────────────
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      console.warn('[UpdateConfig] Failed to parse request body as JSON');
      return NextResponse.json(
        { success: false, error: 'Invalid request: body must be valid JSON' },
        { status: 400 }
      );
    }

    const validationResult = UpdateConfigRequestSchema.safeParse(body);
    if (!validationResult.success) {
      const details = validationResult.error.flatten();
      console.warn('[UpdateConfig] Request validation failed:', details);
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid request parameters',
          details,
        },
        { status: 400 }
      );
    }

    const { tenantId, widgetConfig: incomingConfig } = validationResult.data;

    // ────────────────────────────────────────────────────────────
    // STEP 3: Tenant Ownership Verification (with reseller isolation)
    // ────────────────────────────────────────────────────────────
    const ownership = await validateTenantOwnership(userId, tenantId);
    if (!ownership) {
      console.warn(`[UpdateConfig] Access denied: user ${userId} does not own tenant ${tenantId}`);
      return NextResponse.json(
        { success: false, error: 'Forbidden: you do not have access to this tenant' },
        { status: 403 }
      );
    }

    // ────────────────────────────────────────────────────────────
    // STEP 4: Fetch Current Configuration (with reseller isolation)
    // ────────────────────────────────────────────────────────────
    const { data: tenant, error: fetchError } = await supabase
      .from('tenants')
      .select('id, widget_config, reseller_id')
      .eq('id', tenantId)
      .eq('reseller_id', ownership.resellerId) // Strict isolation
      .single();

    if (fetchError || !tenant) {
      console.error(`[UpdateConfig] Failed to fetch tenant ${tenantId}:`, fetchError?.message);
      return NextResponse.json(
        { success: false, error: 'Tenant not found or access denied' },
        { status: 404 }
      );
    }

    // Store the original config for audit trail
    const oldConfig: WidgetConfig = (tenant.widget_config ?? {}) as WidgetConfig;

    // ────────────────────────────────────────────────────────────
    // STEP 5: Deep Merge Configuration
    // ────────────────────────────────────────────────────────────
    // Only attempt merge if incoming config is provided
    let mergedConfig = { ...oldConfig };

    if (incomingConfig && Object.keys(incomingConfig).length > 0) {
      // Use deep merge utility to combine existing and incoming config
      // Arrays in the incoming config completely replace existing arrays (default behavior)
      mergedConfig = deepMerge(mergedConfig, incomingConfig, { mergeArrays: false });
    }

    // ────────────────────────────────────────────────────────────
    // STEP 6: Validate Merged Configuration
    // ────────────────────────────────────────────────────────────
    // Ensure merged config conforms to schema (catches invalid merges)
    const validationResultMerged = WidgetConfigSchema.safeParse(mergedConfig);
    if (!validationResultMerged.success) {
      const details = validationResultMerged.error.flatten();
      console.warn('[UpdateConfig] Merged configuration validation failed:', details);
      return NextResponse.json(
        {
          success: false,
          error: 'The merged configuration is invalid. Configuration not applied.',
          details,
        },
        { status: 409 } // 409 Conflict: the merge would create an invalid state
      );
    }

    const newConfig = validationResultMerged.data;

    // ────────────────────────────────────────────────────────────
    // STEP 7: Update Database (Application-Layer Transaction)
    // ────────────────────────────────────────────────────────────
    const { error: updateError } = await supabase
      .from('tenants')
      .update({
        widget_config: newConfig,
        updated_at: new Date().toISOString(),
      })
      .eq('id', tenantId)
      .eq('reseller_id', ownership.resellerId) // Maintain isolation in WHERE clause
      .single();

    if (updateError) {
      console.error(`[UpdateConfig] Database update failed for tenant ${tenantId}:`, updateError.message);
      return NextResponse.json(
        { success: false, error: 'Failed to update configuration in database' },
        { status: 500 }
      );
    }

    // ────────────────────────────────────────────────────────────
    // STEP 8: Audit Logging (Before/After Snapshots)
    // ────────────────────────────────────────────────────────────
    try {
      const userIp = getUserIp(request);
      const userEmail = await getUserEmail(supabase);

      await logConfigChange(supabase, {
        tenantId,
        userId,
        action: 'config_update',
        changeType: 'widget_config',
        oldValue: oldConfig,
        newValue: newConfig,
        metadata: {
          userEmail: userEmail || authEmail,
          ipAddress: userIp,
          requestUrl: request.url,
          userAgent: request.headers.get('user-agent'),
        },
      });

      console.info(`[UpdateConfig] Configuration updated for tenant ${tenantId} by user ${userId}`);
    } catch (auditError) {
      // Log audit failure but don't fail the request
      // The config was already updated; only the audit trail failed
      console.error('[UpdateConfig] Failed to log configuration change:', auditError instanceof Error ? auditError.message : String(auditError));
      // Continue and return success anyway — audit trail failure should not break the update
    }

    // ────────────────────────────────────────────────────────────
    // STEP 9: Return Success Response
    // ────────────────────────────────────────────────────────────
    return NextResponse.json(
      {
        success: true,
        widgetConfig: newConfig,
        appliedAt: new Date().toISOString(),
        deprecated: true,
        message: 'Use /api/client/update-studio-config',
      },
      {
        headers: {
          Deprecation: 'true',
        },
      }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[UpdateConfig] Unexpected error:', errorMessage, error);
    return NextResponse.json(
      { success: false, error: 'Internal server error', details: errorMessage },
      { status: 500 }
    );
  }
}

// ──────────────────────────────────────────────
// Unsupported Methods
// ──────────────────────────────────────────────

export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405 }
  );
}

export async function PUT() {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405 }
  );
}

export async function DELETE() {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405 }
  );
}
