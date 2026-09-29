-- CRITICAL SECURITY: Enable Row Level Security for tenants table
-- This prevents unauthorized access between reseller accounts

-- Enable RLS on tenants table
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;

-- Drop the incorrect policy if it exists (old: auth.uid() = reseller_id)
-- auth.uid() returns the user's auth UUID, not the reseller UUID — they never match
DROP POLICY IF EXISTS "resellers_access_own_tenants" ON tenants;

-- Create the correct policy that checks through the user_resellers junction table
-- This resolves: "Is this authenticated user linked to a reseller that owns these tenants?"
CREATE POLICY "resellers_access_own_tenants" ON tenants
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

-- Add comment for security documentation
COMMENT ON POLICY "resellers_access_own_tenants" ON tenants IS 'Critical security policy - Users can only access tenants belonging to their linked reseller accounts via user_resellers junction table';

-- Log the security implementation
DO $$
BEGIN
  RAISE NOTICE 'OVG-PLATFORM-V2: CRITICAL SECURITY - Tenants table RLS policy corrected to use user_resellers junction table';
END $$;