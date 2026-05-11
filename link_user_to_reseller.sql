-- Link your authenticated user to the reseller
-- Replace YOUR_USER_ID_HERE with your actual user ID from auth.users

INSERT INTO user_resellers (user_id, reseller_id, role, is_primary)
VALUES (
  'YOUR_USER_ID_HERE',  -- Get this from: SELECT id, email FROM auth.users WHERE email = 'your-email@example.com';
  '284931b2-6720-476e-ba05-f0a50edc5f06',
  'admin',
  true
)
ON CONFLICT (user_id, reseller_id) DO NOTHING;

-- Verify the link was created
SELECT ur.*, r.tenant_id, r.name
FROM user_resellers ur
JOIN resellers r ON ur.reseller_id = r.id
WHERE ur.user_id = 'YOUR_USER_ID_HERE';
