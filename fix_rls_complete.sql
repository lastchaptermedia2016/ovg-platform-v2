-- First, create the user_resellers table
-- Run this migration first: 008_create_user_resellers_table.sql

-- Then fix the RLS policy on tenants table
DROP POLICY IF EXISTS \
resellers_access_own_tenants\ ON tenants;

CREATE POLICY \resellers_access_own_tenants\ ON tenants
  FOR ALL
  USING (reseller_id IN (
    SELECT ur.reseller_id 
    FROM user_resellers ur 
    WHERE ur.user_id = auth.uid()
  ))
  WITH CHECK (reseller_id IN (
    SELECT ur.reseller_id 
    FROM user_resellers ur 
    WHERE ur.user_id = auth.uid()
  ));

-- Verify the policy was created
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check 
FROM pg_policies 
WHERE tablename = 'tenants' AND policyname = 'resellers_access_own_tenants';
