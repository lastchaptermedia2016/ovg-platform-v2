-- Manual SQL to link test user to Acme Corp reseller
-- Run this in Supabase SQL Editor after creating the test user

-- Step 1: Get the reseller ID (note this down)
SELECT id, tenant_id FROM resellers WHERE tenant_id = 'acme-corp';

-- Step 2: Get the user ID (note this down)
SELECT id, email FROM auth.users WHERE email = 'test-reseller@acme-corp.com';

-- Step 3: Update user metadata (replace [RESELLER_ID] with actual UUID from step 1)
-- Run this in Supabase Dashboard → Authentication → Users → Edit User → User Metadata
-- Or use the admin API:
-- {
--   "reseller_id": "[RESELLER_ID]",
--   "reseller_slug": "acme-corp",
--   "role": "reseller"
-- }

-- Step 4: Link in user_resellers table (replace [USER_ID] and [RESELLER_ID])
INSERT INTO user_resellers (user_id, reseller_id, role, is_primary)
VALUES (
  '[USER_ID]',  -- Replace with actual user UUID
  '[RESELLER_ID]',  -- Replace with actual reseller UUID
  'admin',
  true
)
ON CONFLICT (user_id, reseller_id) DO NOTHING;
