'use server';

import { createAuthClient, getAuthenticatedUser, validateTenantOwnership } from '@/lib/auth/server';
import { adaptPayload, computeDelta } from '@/lib/services/tenant-config.service';
import { WidgetConfigSchema } from '@/lib/schemas/tenant-config.schema';
import { logConfigChange } from '@/lib/audit/logger';

/**
 * Tenant Configuration Sync Server Action
 *
 * Handles atomic synchronization of tenant widget configuration with:
 * - Authentication and authorization verification
 * - Payload normalization (supports both branding/features and configPatch formats)
 * - Deep merge validation
 * - Audit logging with delta computation
 * - Complete error handling
 */
export async function syncTenantConfig(payload: unknown): Promise<{
  success: boolean;
  widget_config?: Record<string, unknown>;
  appliedAt?: string;
  error?: string;
  details?: unknown;
}> {
  try {
    // STEP 1: Authenticate
    const { userId, email: authEmail, error: authError } = await getAuthenticatedUser();
    if (authError || !userId) {
      return { success: false, error: 'Unauthorized: user not authenticated' };
    }

    const supabase = await createAuthClient();

    // STEP 2: Extract and validate tenantId
    if (!payload || typeof payload !== 'object' || !('tenantId' in payload)) {
      return { success: false, error: 'tenantId is required in payload' };
    }

    const { tenantId } = payload as { tenantId: unknown };

    if (
      typeof tenantId !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId)
    ) {
      return { success: false, error: 'Invalid tenantId format (must be UUID)' };
    }

    // STEP 3: Verify ownership
    const ownership = await validateTenantOwnership(userId, tenantId);
    if (!ownership) {
      return { success: false, error: 'Forbidden: access denied to this tenant' };
    }

    // STEP 4: Fetch existing config
    const { data: tenant, error: fetchErr } = await supabase
      .from('tenants')
      .select('id, widget_config, reseller_id')
      .eq('id', tenantId)
      .eq('reseller_id', ownership.resellerId)
      .single();

    if (fetchErr || !tenant) {
      return { success: false, error: 'Tenant not found or access denied' };
    }

    const oldConfig = (tenant.widget_config ?? {}) as Record<string, unknown>;

    // STEP 5: Normalize payload
    const normalizedConfig = adaptPayload(payload);

    // STEP 6: Validate config
    const validationResult = WidgetConfigSchema.safeParse(normalizedConfig);
    if (!validationResult.success) {
      return {
        success: false,
        error: 'Configuration validation failed',
        details: validationResult.error.flatten(),
      };
    }

    const newConfig = validationResult.data as Record<string, unknown>;

    // STEP 7: Update database
    const { error: updateErr } = await supabase
      .from('tenants')
      .update({
        widget_config: newConfig,
        updated_at: new Date().toISOString(),
      })
      .eq('id', tenantId)
      .eq('reseller_id', ownership.resellerId)
      .single();

    if (updateErr) {
      console.error('[TenantSyncAction] Update failed:', updateErr.message);
      return { success: false, error: 'Failed to update tenant configuration' };
    }

    // STEP 8: Log to audit trail (best-effort)
    try {
      const delta = computeDelta(oldConfig, newConfig);

      await logConfigChange(supabase, {
        tenantId,
        userId,
        action: 'config_update',
        changeType: 'widget_config',
        oldValue: oldConfig,
        newValue: newConfig,
        metadata: {
          delta,
          userEmail: authEmail,
          gateway: 'server-action',
        },
      });

      console.info(`[TenantSyncAction] Configuration synced for tenant ${tenantId}`);
    } catch (auditErr) {
      console.error('[TenantSyncAction] Audit logging failed:', auditErr instanceof Error ? auditErr.message : String(auditErr));
      // Don't fail response for audit errors
    }

    // STEP 9: Return success
    return {
      success: true,
      widget_config: newConfig,
      appliedAt: new Date().toISOString(),
    };

  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[TenantSyncAction] Error:', msg);
    return { success: false, error: 'Internal server error' };
  }
}
