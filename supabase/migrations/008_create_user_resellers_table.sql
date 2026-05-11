-- Create user_resellers linking table for multi-tenant user management
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

-- Add comments for documentation
COMMENT ON TABLE user_resellers IS 'Links users to resellers they have access to for multi-tenant management';
COMMENT ON COLUMN user_resellers.user_id IS 'Foreign key to auth.users table';
COMMENT ON COLUMN user_resellers.reseller_id IS 'Foreign key to resellers table';
COMMENT ON COLUMN user_resellers.role IS 'User role within the reseller organization';
COMMENT ON COLUMN user_resellers.is_primary IS 'Whether this is the user primary reseller relationship';

-- Log the table creation
DO $$
BEGIN
  RAISE NOTICE 'OVG-PLATFORM-V2: Created user_resellers table for multi-tenant user management';
END $$;