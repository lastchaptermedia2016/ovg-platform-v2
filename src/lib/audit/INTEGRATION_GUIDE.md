# Audit Logging Integration Guide

This document describes how to integrate the audit logging infrastructure into your application, particularly for the `update-config/route.ts` endpoint.

## Overview

The audit logging system captures all configuration changes to tenants with:
- **Before and after snapshots** (complete `oldValue` and `newValue`)
- **Computed delta** (only the fields that changed)
- **Full metadata context** (user info, IP address, client details, etc.)
- **Row-Level Security** (users can only read logs for their own tenants)

## Database Setup

The migration `supabase/migrations/014_create_tenant_logs_table.sql` creates:

1. **tenant_logs table** with columns:
   - `id`, `tenant_id`, `user_id` (audit context)
   - `action`, `change_type` (classification)
   - `old_value`, `new_value`, `delta` (change data)
   - `metadata` (additional context)
   - `created_at`, `updated_at` (timestamps)

2. **Indexes** for efficient queries:
   - `(tenant_id, created_at DESC)` - retrieve audit trail
   - `(tenant_id)` - filter by tenant
   - `(user_id)` - track user actions

3. **Row-Level Security policies**:
   - Users can read logs for tenants they manage
   - Only service role can insert logs

## API Integration

### Example: Logging a Widget Config Update

In your API route (e.g., `src/app/api/reseller/[resellerSlug]/update-config/route.ts`):

```typescript
import { logConfigChange, getConfigChangeHistory } from '@/lib/audit/logger';
import { createClient } from '@/lib/supabase/server';

export async function POST(
  req: Request,
  { params }: { params: { resellerSlug: string } }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { tenantId, newConfig } = await req.json();

  // 1. Fetch current config (before state)
  const { data: tenant } = await supabase
    .from('tenants')
    .select('widget_config')
    .eq('id', tenantId)
    .single();

  const oldConfig = tenant?.widget_config || {};

  // 2. Update config
  const { data: updated, error } = await supabase
    .from('tenants')
    .update({ widget_config: newConfig })
    .eq('id', tenantId)
    .select('widget_config')
    .single();

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 3. Log the change in the audit trail
  await logConfigChange(supabase, {
    tenantId,
    userId: user.id,
    action: 'config_update',
    changeType: 'widget_config',
    oldValue: oldConfig,
    newValue: newConfig,
    metadata: {
      userEmail: user.email,
      ipAddress: req.headers.get('x-forwarded-for') || 'unknown',
      userAgent: req.headers.get('user-agent'),
    },
  });

  return new Response(JSON.stringify(updated), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
```

### Example: Retrieving Audit History

```typescript
import { getConfigChangeHistory } from '@/lib/audit/logger';
import { createClient } from '@/lib/supabase/server';

export async function GET(
  req: Request,
  { params }: { params: { tenantId: string } }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const history = await getConfigChangeHistory(
      supabase,
      params.tenantId,
      20 // retrieve last 20 changes
    );

    return new Response(JSON.stringify(history), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
```

## Data Structures

### ConfigChangeLog (What You Pass In)

```typescript
interface ConfigChangeLog {
  tenantId: string;
  userId?: string; // Optional for system actions
  action: 'config_update' | 'feature_flag_change';
  changeType: 'widget_config' | 'custom_assets' | 'branding';
  oldValue: Record<string, unknown>;
  newValue: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}
```

### AuditLogEntry (What You Get Back)

```typescript
interface AuditLogEntry extends ConfigChangeLog {
  id: string;
  delta?: Record<string, { old: unknown; new: unknown }>;
  createdAt: string;
  updatedAt: string;
}
```

## Delta Computation

The delta is automatically computed and contains only fields that changed:

```typescript
// Example scenario:
const oldValue = { title: 'Old', color: 'blue', width: 100 };
const newValue = { title: 'New', color: 'blue', width: 100 };

// Delta computed automatically:
{
  title: { old: 'Old', new: 'New' }
  // color and width excluded (no change)
}
```

## Key Features

### 1. Automatic Delta Computation
Only changed fields are recorded, reducing noise and making audit trails easier to read.

### 2. Complete Snapshots
Both `old_value` and `new_value` are stored as JSONB, supporting:
- Nested objects
- Arrays
- Null/undefined values
- Any JSON-serializable data

### 3. Metadata Context
Capture important context for every change:
- User email / ID
- IP address (from request headers)
- User agent
- Custom metadata (reason, feature gate, percentage rollout, etc.)

### 4. Row-Level Security
Users can only read audit logs for tenants they manage, enforced at the database level.

### 5. Error Handling
Validation errors are thrown with descriptive messages:
- Invalid `tenantId`, `action`, or `changeType`
- Missing required fields
- Database connection failures
- Query failures

## Example: Complex Scenario

```typescript
// Branding update with nested objects
await logConfigChange(supabase, {
  tenantId: 'tenant-123',
  userId: 'user-456',
  action: 'config_update',
  changeType: 'branding',
  oldValue: {
    primaryColor: '#0000FF',
    logo: { url: 'https://example.com/old-logo.png', width: 200 },
    fonts: { heading: 'Arial', body: 'Verdana' }
  },
  newValue: {
    primaryColor: '#0000FF',
    logo: { url: 'https://example.com/new-logo.png', width: 300 },
    fonts: { heading: 'Roboto', body: 'Verdana' }
  },
  metadata: {
    reason: 'Brand refresh 2024',
    approvedBy: 'marketing-team',
    changeTicket: 'TICKET-12345'
  }
});

// Delta will automatically capture:
{
  logo: {
    old: { url: '...old-logo.png', width: 200 },
    new: { url: '...new-logo.png', width: 300 }
  },
  fonts: {
    old: { heading: 'Arial', body: 'Verdana' },
    new: { heading: 'Roboto', body: 'Verdana' }
  }
}
```

## Testing

The test suite (`src/lib/audit/logger.test.ts`) includes:

- ✅ Successful logging of configuration changes
- ✅ Delta computation (only changed fields)
- ✅ Handling null/undefined values
- ✅ Retrieving audit trails
- ✅ Error handling for invalid inputs
- ✅ Error handling for database failures
- ✅ Metadata attachment
- ✅ Timestamp validation
- ✅ Real-world scenarios (branding updates, feature flag toggles)

Run tests with:
```bash
npx vitest run src/lib/audit/logger.test.ts
```

## Transaction Safety

When using audit logging within a database transaction, ensure:

1. **Log within the transaction**: Call `logConfigChange` before committing
2. **Handle errors**: If logging fails, the transaction will fail (preventing orphaned changes)
3. **Service role for system actions**: Use `supabaseAdmin` from `src/lib/supabase/admin.ts` for system-initiated changes

Example:

```typescript
// Update + Log within same transaction
try {
  // 1. Update config
  await supabase.from('tenants').update(newConfig).eq('id', tenantId);

  // 2. Log the change (in same transaction)
  await logConfigChange(supabase, {
    tenantId,
    userId: user.id,
    action: 'config_update',
    changeType: 'widget_config',
    oldValue,
    newValue,
  });

  // Both succeed or both fail (via transaction rollback)
} catch (err) {
  // Handle transaction failure
}
```

## Performance Considerations

1. **Indexes**: Queries by `tenant_id` and `created_at` are indexed for O(log n) performance
2. **JSONB Storage**: Database-native support for efficient querying of delta contents
3. **Pagination**: Use the `limit` parameter to control result size
4. **RLS Policies**: Enforce tenant isolation at the database layer

## Future Enhancements

Potential additions:

1. **Revert API**: Full implementation of `revertToSnapshot` to restore previous configurations
2. **Audit Reports**: Periodic reports of changes by user, tenant, or date range
3. **Change Webhooks**: Notify external systems when configurations change
4. **Approval Workflows**: Capture who approved or rejected a configuration change
5. **Compliance Export**: Generate audit reports for regulatory compliance
