-- Fix the incorrect RLS policy on tenants table

-- First, drop the wrong policy
DROP POLICY IF EXISTS \
resellers_access_own_tenants\ ON tenants;

-- Create the correct policy that checks user_resellers relationship
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
