-- Complete fix for RLS policy issue
-- Run these commands in order in your Supabase SQL Editor
--
-- ROOT CAUSE: The original RLS policy enforced auth.uid() = reseller_id
--            But auth.uid() returns the USER's auth UUID, while reseller_id
--            is the RESELLER ACCOUNT UUID. These never match.
--
-- FIX: Check through the user_resellers junction table instead

-- STEP 1: Create the user_resellers table (if not exists)
-- This table links users to resellers they have access to
CREATE TABLE IF NOT EXISTS user_resellers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reseller_id UUID NOT NULL REFERENCES resellers(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'manager', 'viewer')),
  is_primary BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, reseller_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_resellers_user_id ON user_resellers(user_id);
CREATE INDEX IF NOT EXISTS idx_user_resellers_reseller_id ON user_resellers(reseller_id);

-- Enable RLS on user_resellers table
ALTER TABLE user_resellers ENABLE ROW LEVEL SECURITY;

-- Create policy for user_resellers - users can only see their own relationships
CREATE POLICY "users_access_own_reseller_relationships" ON user_resellers
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- STEP 2: Fix the RLS policy on tenants table
-- Drop the INCORRECT policy (auth.uid() = reseller_id)
DROP POLICY IF EXISTS "resellers_access_own_tenants" ON tenants;

-- Create the CORRECT policy that checks user_resellers relationship
-- This resolves: "Is this user linked to a reseller that owns these tenants?"
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

-- STEP 3: Link your authenticated user to the reseller
-- IMPORTANT: Replace YOUR_USER_ID_HERE with your actual user ID
-- Run: SELECT id, email FROM auth.users WHERE email = 'your-email@example.com';
INSERT INTO user_resellers (user_id, reseller_id, role, is_primary)
VALUES (
  'YOUR_USER_ID_HERE',  -- ← REPLACE THIS with your actual user auth UUID
  '284931b2-6720-476e-ba05-f0a50edc5f06',
  'admin',
  true
)
ON CONFLICT (user_id, reseller_id) DO NOTHING;

-- STEP 4: Verify everything is set up correctly
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename IN ('tenants', 'user_resellers')
ORDER BY tablename, policyname;

-- Also verify the user-reseller link exists
SELECT ur.*, r.tenant_id, r.name
FROM user_resellers ur
JOIN resellers r ON ur.reseller_id = r.id
WHERE ur.user_id = 'YOUR_USER_ID_HERE';  -- ← REPLACE THIS too