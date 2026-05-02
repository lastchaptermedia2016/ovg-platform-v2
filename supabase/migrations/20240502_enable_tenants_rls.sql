-- CRITICAL SECURITY: Enable Row Level Security for tenants table
-- This prevents unauthorized access between reseller accounts

-- Enable RLS on tenants table
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;

-- Create policy to ensure users can only access their own reseller's tenants
-- This policy enforces: auth.uid() = reseller_id
CREATE POLICY "resellers_access_own_tenants" ON tenants
  FOR ALL
  USING (auth.uid() = reseller_id)
  WITH CHECK (auth.uid() = reseller_id);

-- Add comment for security documentation
COMMENT ON POLICY "resellers_access_own_tenants" ON tenants IS 'Critical security policy - Users can only access tenants belonging to their reseller account';

-- Log the security implementation
DO $$
BEGIN
  RAISE NOTICE 'OVG-PLATFORM-V2: CRITICAL SECURITY - Tenants table RLS enabled with policy auth.uid() = reseller_id';
END $$;
