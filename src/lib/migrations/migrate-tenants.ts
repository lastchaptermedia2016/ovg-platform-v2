/**
 * Tenant Configuration Migration Utility
 *
 * Transforms legacy flat-field widget configurations into the canonical
 * nested structure defined by CanonicalWidgetConfigSchema.
 *
 * Usage:
 *   npx tsx src/lib/migrations/migrate-tenants.ts --dry-run
 *   npx tsx src/lib/migrations/migrate-tenants.ts
 */

import { supabaseAdmin } from '../supabase/admin';
import { safeParseCanonicalWidgetConfig } from '../schemas/tenant-config.canonical';
import {
  migrateLegacyConfig,
  hasLegacyFlatFields,
  hasMissingNestedStructures,
  buildDiffSummary,
} from './transform';

// ──────────────────────────────────────────────────────────────────────────────
// Configuration
// ──────────────────────────────────────────────────────────────────────────────

const BATCH_SIZE = 100;
const DRY_RUN = process.argv.includes('--dry-run');

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

interface Tenant {
  id: string;
  name?: string;
  widget_config: unknown;
}

interface MigrationStats {
  total: number;
  processed: number;
  migrated: number;
  skipped: number;
  errors: number;
  unchanged: number;
}

// ──────────────────────────────────────────────────────────────────────────────
// Processing
// ──────────────────────────────────────────────────────────────────────────────

const stats: MigrationStats = {
  total: 0,
  processed: 0,
  migrated: 0,
  skipped: 0,
  errors: 0,
  unchanged: 0,
};

async function processTenants() {
  console.log('🚀 Tenant Configuration Migration');
  console.log(`📋 Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE'}`);
  console.log(`📦 Batch size: ${BATCH_SIZE}`);
  console.log('');

  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const { data: tenants, error } = await supabaseAdmin
      .from('tenants')
      .select('id, name, widget_config')
      .range(offset, offset + BATCH_SIZE - 1)
      .order('id', { ascending: true });

    if (error) {
      console.error('❌ Failed to fetch tenants batch:', error.message);
      process.exit(1);
    }

    if (!tenants || tenants.length === 0) {
      break;
    }

    stats.total += tenants.length;

    for (const tenant of tenants) {
      await processTenant(tenant);
      stats.processed++;
    }

    offset += tenants.length;
    hasMore = tenants.length >= BATCH_SIZE;
  }

  printSummary();
}

async function processTenant(tenant: Tenant) {
  const tenantLabel = tenant.name ? `${tenant.name} (${tenant.id})` : tenant.id;

  if (!tenant.widget_config || typeof tenant.widget_config !== 'object' || Array.isArray(tenant.widget_config)) {
    console.log(`⏭️  Skipping ${tenantLabel}: empty/null widget_config`);
    stats.skipped++;
    return;
  }

  const legacy = tenant.widget_config as Record<string, unknown>;

  try {
    const migrated = migrateLegacyConfig(legacy);

    const validation = safeParseCanonicalWidgetConfig(migrated);
    if (!validation.success) {
      console.error(`❌ Validation failed for ${tenantLabel}:`, validation.error.errors.map((e) => e.message).join('; '));
      stats.errors++;
      return;
    }

    if (!hasLegacyFlatFields(legacy) && !hasMissingNestedStructures(legacy)) {
      stats.unchanged++;
      return;
    }

    const diffs = buildDiffSummary(legacy, validation.data);

    if (DRY_RUN) {
      console.log(`🔍 [DRY RUN] ${tenantLabel}`);
      for (const diff of diffs) console.log(`    ${diff}`);
      if (diffs.length === 0) console.log('    (no changes needed)');
      stats.migrated++;
      return;
    }

    const { error: updateError } = await supabaseAdmin
      .from('tenants')
      .update({
        widget_config: validation.data,
        updated_at: new Date().toISOString(),
      })
      .eq('id', tenant.id);

    if (updateError) {
      console.error(`❌ DB update failed for ${tenantLabel}:`, updateError.message);
      stats.errors++;
      return;
    }

    console.log(`✅ Migrated ${tenantLabel}`);
    for (const diff of diffs) console.log(`    ${diff}`);
    stats.migrated++;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`❌ Unexpected error processing ${tenantLabel}:`, message);
    stats.errors++;
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Summary
// ──────────────────────────────────────────────────────────────────────────────

function printSummary() {
  console.log('\n========================================');
  console.log('📊 Migration Summary');
  console.log('========================================');
  console.log(`Total tenants found:     ${stats.total}`);
  console.log(`Processed:               ${stats.processed}`);
  console.log(`Migrated:                ${stats.migrated}`);
  console.log(`Skipped (empty config):  ${stats.skipped}`);
  console.log(`Validation errors:       ${stats.errors}`);
  console.log(`Unchanged:               ${stats.unchanged}`);
  console.log('========================================');

  if (DRY_RUN && stats.migrated > 0) {
    console.log('⚠️  This was a dry run. Re-run without --dry-run to apply changes.');
  }

  if (stats.errors > 0) {
    console.log('⚠️  Some tenants failed. Review logs above and retry if needed.');
    process.exitCode = 1;
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Entry Point
// ──────────────────────────────────────────────────────────────────────────────

processTenants().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
