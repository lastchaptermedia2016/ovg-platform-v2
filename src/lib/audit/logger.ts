import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Represents a configuration change to be logged in the audit trail
 */
export interface ConfigChangeLog {
  /** ID of the tenant that was modified */
  tenantId: string;

  /** ID of the user who made the change (optional for system actions) */
  userId?: string;

  /** Type of action performed */
  action: 'config_update' | 'feature_flag_change';

  /** Category of configuration changed */
  changeType: 'widget_config' | 'custom_assets' | 'branding';

  /** Complete snapshot before the change */
  oldValue: Record<string, unknown>;

  /** Complete snapshot after the change */
  newValue: Record<string, unknown>;

  /** Optional metadata for additional context (email, IP, client info, etc.) */
  metadata?: Record<string, unknown>;
}

/**
 * Represents a logged configuration change as retrieved from the database
 */
export interface AuditLogEntry extends ConfigChangeLog {
  id: string;
  delta?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/**
 * Computes the delta (differences) between old and new values
 * Only includes fields that changed
 */
function computeDelta(
  oldValue: Record<string, unknown>,
  newValue: Record<string, unknown>
): Record<string, { old: unknown; new: unknown }> {
  const delta: Record<string, { old: unknown; new: unknown }> = {};

  // Check for added or modified fields
  for (const key in newValue) {
    if (!(key in oldValue) || oldValue[key] !== newValue[key]) {
      delta[key] = {
        old: oldValue[key],
        new: newValue[key],
      };
    }
  }

  // Check for deleted fields
  for (const key in oldValue) {
    if (!(key in newValue)) {
      delta[key] = {
        old: oldValue[key],
        new: undefined,
      };
    }
  }

  return delta;
}

/**
 * Validates a ConfigChangeLog for required fields and data integrity
 */
function validateLog(log: ConfigChangeLog): void {
  if (!log.tenantId || typeof log.tenantId !== 'string') {
    throw new Error('Invalid or missing tenantId');
  }

  if (!['config_update', 'feature_flag_change'].includes(log.action)) {
    throw new Error(`Invalid action: ${log.action}`);
  }

  if (!['widget_config', 'custom_assets', 'branding'].includes(log.changeType)) {
    throw new Error(`Invalid changeType: ${log.changeType}`);
  }

  if (!log.oldValue || typeof log.oldValue !== 'object') {
    throw new Error('oldValue must be a non-null object');
  }

  if (!log.newValue || typeof log.newValue !== 'object') {
    throw new Error('newValue must be a non-null object');
  }
}

/**
 * Logs a configuration change to the audit trail
 *
 * @param supabase - Supabase client instance (should be authenticated)
 * @param log - Configuration change details
 * @throws Error if validation fails or database operation fails
 */
export async function logConfigChange(
  supabase: SupabaseClient,
  log: ConfigChangeLog
): Promise<void> {
  // Validate input
  validateLog(log);

  // Compute delta
  const delta = computeDelta(log.oldValue, log.newValue);

  // Insert into tenant_logs table
  const { error } = await supabase.from('tenant_logs').insert({
    tenant_id: log.tenantId,
    user_id: log.userId || null,
    action: log.action,
    change_type: log.changeType,
    old_value: log.oldValue,
    new_value: log.newValue,
    delta,
    metadata: log.metadata || null,
  });

  if (error) {
    throw new Error(`Failed to log configuration change: ${error.message}`);
  }
}

/**
 * Retrieves the audit trail for a tenant
 *
 * @param supabase - Supabase client instance
 * @param tenantId - ID of the tenant to retrieve logs for
 * @param limit - Maximum number of entries to retrieve (default: 50)
 * @returns Array of audit log entries ordered by most recent first
 * @throws Error if the tenant doesn't exist or query fails
 */
export async function getConfigChangeHistory(
  supabase: SupabaseClient,
  tenantId: string,
  limit: number = 50
): Promise<AuditLogEntry[]> {
  if (!tenantId || typeof tenantId !== 'string') {
    throw new Error('Invalid or missing tenantId');
  }

  if (limit < 1 || limit > 1000) {
    throw new Error('Limit must be between 1 and 1000');
  }

  const { data, error } = await supabase
    .from('tenant_logs')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to retrieve audit trail: ${error.message}`);
  }

  if (!data) {
    return [];
  }

  // Transform database records to AuditLogEntry format
  return data.map((record) => ({
    id: record.id,
    tenantId: record.tenant_id,
    userId: record.user_id,
    action: record.action,
    changeType: record.change_type,
    oldValue: record.old_value,
    newValue: record.new_value,
    delta: record.delta,
    metadata: record.metadata,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  }));
}

/**
 * Reverts a configuration to a previous snapshot from the audit trail
 *
 * @param supabase - Supabase client instance (should have admin privileges)
 * @param tenantId - ID of the tenant
 * @param snapshotId - ID of the audit log entry to revert to
 * @throws Error if the snapshot doesn't exist or revert operation fails
 *
 * Note: This is a helper function. The actual revert logic depends on your
 * application's configuration storage and update mechanisms.
 */
export async function revertToSnapshot(
  supabase: SupabaseClient,
  tenantId: string,
  snapshotId: string
): Promise<void> {
  if (!tenantId || typeof tenantId !== 'string') {
    throw new Error('Invalid or missing tenantId');
  }

  if (!snapshotId || typeof snapshotId !== 'string') {
    throw new Error('Invalid or missing snapshotId');
  }

  // Retrieve the historical snapshot
  const { data, error } = await supabase
    .from('tenant_logs')
    .select('old_value, new_value, action, change_type')
    .eq('id', snapshotId)
    .eq('tenant_id', tenantId)
    .single();

  if (error || !data) {
    throw new Error(
      `Failed to retrieve snapshot ${snapshotId}: ${error?.message || 'Snapshot not found'}`
    );
  }

  // The actual revert would depend on your configuration table structure
  // This function provides the framework for retrieving the snapshot
  // Implementation details should be added based on your specific configuration schema
  console.log(
    `[Audit] Reverting tenant ${tenantId} to snapshot ${snapshotId}. Old value:`,
    data.old_value
  );
}
