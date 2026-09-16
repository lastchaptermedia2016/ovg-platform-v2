# Migration Guide: System Tasks Table

## Status: Migration File Exists — Ready for Application

**File:** `supabase/migrations/20240620_create_system_tasks_table.sql`  
**Status:** ✅ File exists, syntax verified, ready for deployment  
**Affected Code:** `src/lib/orchestrator/worker.ts`, `src/lib/audit/command-dispatcher.ts`

---

## What This Migration Does

Creates the `system_tasks` table for asynchronous processing of headless infrastructure commands (build, CRM sync, asset reload).

### Schema

```sql
CREATE TABLE IF NOT EXISTS system_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  command TEXT NOT NULL,
  payload JSONB,
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
  error_log TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX idx_system_tasks_status_created
  ON system_tasks (status, created_at ASC);

ALTER TABLE system_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages system_tasks"
  ON system_tasks
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
```

### Supported Commands

The migration enables the following orchestrator commands:
- `SYSTEM_EXECUTE_BUILD` — Trigger build pipeline
- `SYSTEM_SYNC_CRM` — Initiate CRM integration
- `SYSTEM_RELOAD_ASSETS` — Reload asset cache

---

## How to Apply This Migration

### Option 1: Via Supabase Dashboard (Recommended for Manual Testing)

1. Go to [Supabase Dashboard](https://supabase.com)
2. Select your project
3. Navigate to **SQL Editor** → **New Query**
4. Copy the entire contents of `supabase/migrations/20240620_create_system_tasks_table.sql`
5. Paste into the editor and click **Run**
6. Verify success (no errors, table appears in **Schema**)

### Option 2: Via Supabase CLI (Recommended for CI/CD)

```bash
# Install/update Supabase CLI if needed
npm install -g supabase

# Link to your project
supabase link --project-ref <PROJECT_REF>

# Push all pending migrations (including this one)
supabase db push

# Or push a specific migration
supabase migration up 20240620_create_system_tasks_table
```

### Option 3: Via Your CI/CD Pipeline

Add to your deployment script:

```bash
#!/bin/bash
# Example: deploy.sh

# Push pending migrations to Supabase
npx supabase db push --project-ref "$SUPABASE_PROJECT_REF"

# Verify the migration succeeded
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM system_tasks LIMIT 1;" || exit 1

echo "✅ system_tasks migration applied successfully"
```

---

## Verification

### Check if Migration Has Been Applied

**Via Supabase Dashboard:**
1. Go to **SQL Editor**
2. Run: `SELECT COUNT(*) FROM system_tasks;`
3. If no error → migration is applied ✅
4. If error "relation does not exist" → migration not yet applied ❌

**Via psql CLI:**
```bash
psql "$DATABASE_URL" -c "\dt system_tasks"
```

**Via SQL Query:**
```sql
SELECT table_name
FROM information_schema.tables
WHERE table_name = 'system_tasks'
  AND table_schema = 'public';
```

### Expected Output
```
 table_name
--------------
 system_tasks
(1 row)
```

---

## Post-Migration Verification

After applying the migration, verify the worker can connect:

1. **Check Policies:** Run the following query:
   ```sql
   SELECT policyname, roles
   FROM pg_policies
   WHERE tablename = 'system_tasks';
   ```
   **Expected:** One policy `"Service role manages system_tasks"` for role `service_role`

2. **Check Index:** Run:
   ```sql
   SELECT indexname FROM pg_indexes
   WHERE tablename = 'system_tasks';
   ```
   **Expected:** `idx_system_tasks_status_created`

3. **Test Insert (Service Role):**
   ```sql
   INSERT INTO system_tasks (command, payload, status)
   VALUES ('SYSTEM_EXECUTE_BUILD', '{"test": true}'::jsonb, 'PENDING')
   RETURNING id, command, status;
   ```
   **Expected:** Row inserted successfully

---

## Dependent Code

The following code already implements the system_tasks queue and worker:

### Worker Loop (`src/lib/orchestrator/worker.ts`)
- Polls `system_tasks` every 5 seconds
- Fetches PENDING tasks (batch size: 10)
- Executes matching orchestrator handlers
- Updates status to COMPLETED or FAILED

### Command Dispatcher (`src/lib/audit/command-dispatcher.ts`)
- Queues critical commands into `system_tasks`
- Returns `{ status: 'QUEUED', taskId }`
- Executes lightweight commands inline

### Feature Registry (`src/lib/audit/feature-registry.ts`)
- Defines orchestrator handlers for:
  - `SYSTEM_EXECUTE_BUILD` → `build-pipeline.ts`
  - `SYSTEM_SYNC_CRM` → `crm-sync.ts`
  - `SYSTEM_RELOAD_ASSETS` → `asset-reload.ts`

---

## Troubleshooting

### Issue: "relation does not exist"
**Cause:** Migration has not been applied  
**Fix:** Apply the migration using one of the options above

### Issue: "permission denied for schema public"
**Cause:** Service role doesn't have permissions  
**Fix:** Use the Supabase dashboard with your admin credentials to apply the migration

### Issue: Worker doesn't process tasks
**Cause:** `system_tasks` table exists but worker isn't running  
**Fix:** Ensure `src/lib/orchestrator/worker.ts` is called by your application startup

---

## Rollback

If needed, rollback the migration:

```bash
# Via CLI
supabase db reset  # ⚠️ Resets entire database

# Via Dashboard
# Drop the table manually (only if necessary):
DROP TABLE IF EXISTS system_tasks;
```

---

## Timeline

- **Migration File Created:** 2024-06-20
- **Code Integrated:** ✅ Worker and dispatcher implemented
- **Live Application:** ✅ Ready for production
- **Target Deployment:** Next scheduled maintenance window

---

## Questions?

1. Check `supabase/migrations/20240620_create_system_tasks_table.sql` for the full schema
2. Check `src/lib/orchestrator/worker.ts` for worker implementation
3. Check `src/lib/audit/command-dispatcher.ts` for queue logic
4. Contact DevOps team for Supabase CLI access or CI/CD integration questions

---

**Last Updated:** September 15, 2026  
**Status:** Ready for Application ✅
