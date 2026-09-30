-- 20260725220001_fix_mute_state_tenant_fk.sql
-- Fix conversation_mute_state tenant_id FK to reference tenants(id) and convert TEXT to UUID safely

-- 1. Drop the dependent RLS policy first so the column type can be altered.
DROP POLICY IF EXISTS resellers_manage_mute ON conversation_mute_state;

-- 2. Drop the old foreign key constraint if it exists.
ALTER TABLE conversation_mute_state
  DROP CONSTRAINT IF EXISTS conversation_mute_state_tenant_id_fkey;

-- 3. Convert tenant_id from TEXT to UUID safely.
ALTER TABLE conversation_mute_state
  ALTER COLUMN tenant_id TYPE UUID
  USING tenant_id::uuid;

-- 4. Add the corrected foreign key referencing tenants(id).
ALTER TABLE conversation_mute_state
  ADD CONSTRAINT conversation_mute_state_tenant_id_fkey
  FOREIGN KEY (tenant_id)
  REFERENCES tenants(id)
  ON DELETE CASCADE;

-- 5. Recreate the RLS policy pointing to your user mapping table.
CREATE POLICY resellers_manage_mute
  ON conversation_mute_state
  FOR ALL
  TO authenticated
  USING (
    tenant_id = (SELECT tenant_id FROM user_resellers WHERE user_id = auth.uid())
  )
  WITH CHECK (
    tenant_id = (SELECT tenant_id FROM user_resellers WHERE user_id = auth.uid())
  );