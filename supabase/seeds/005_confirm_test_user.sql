-- Force-confirm test user email (Option B - Sniper Approach)
-- Run this in Supabase SQL Editor to bypass email confirmation requirement

UPDATE auth.users 
SET email_confirmed_at = NOW(), 
    confirmed_at = NOW(),
    last_sign_in_at = NOW()
WHERE email = 'test-reseller@acme-corp.com';

-- Verify the update
SELECT 
  id, 
  email, 
  email_confirmed_at, 
  confirmed_at,
  last_sign_in_at,
  raw_user_meta_data
FROM auth.users 
WHERE email = 'test-reseller@acme-corp.com';
