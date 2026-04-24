-- Seed Test Reseller User for Development
-- This creates a test user linked to Acme Corp reseller

-- First, ensure Acme Corp reseller exists
INSERT INTO resellers (tenant_id, name, email, branding_color, accent_color, logo_url, is_active)
VALUES (
  'acme-corp',
  'Acme Corp',
  'admin@acme-corp.com',
  '#E74C3C',
  '#F39C12',
  '/logos/acme-corp.svg',
  true
)
ON CONFLICT (tenant_id) DO UPDATE SET
  name = EXCLUDED.name,
  branding_color = EXCLUDED.branding_color,
  accent_color = EXCLUDED.accent_color,
  logo_url = EXCLUDED.logo_url,
  is_active = true;

-- Note: auth.users table entries should be created via Supabase Auth API
-- The user will be linked to reseller via app_metadata or a separate user_resellers table
-- 
-- For local development, after creating the user via sign-up, run:
-- UPDATE auth.users 
-- SET app_metadata = jsonb_build_object(
--   'reseller_id', (SELECT id FROM resellers WHERE tenant_id = 'acme-corp'),
--   'role', 'reseller'
-- )
-- WHERE email = 'test-reseller@acme-corp.com';

-- Create user_resellers linking table if not exists
CREATE TABLE IF NOT EXISTS user_resellers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  reseller_id UUID NOT NULL REFERENCES resellers(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'manager', 'viewer')),
  is_primary BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, reseller_id)
);

-- Link test user to Acme Corp (run after user is created in auth.users)
-- INSERT INTO user_resellers (user_id, reseller_id, role, is_primary)
-- VALUES (
--   (SELECT id FROM auth.users WHERE email = 'test-reseller@acme-corp.com'),
--   (SELECT id FROM resellers WHERE tenant_id = 'acme-corp'),
--   'admin',
--   true
-- )
-- ON CONFLICT DO NOTHING;
