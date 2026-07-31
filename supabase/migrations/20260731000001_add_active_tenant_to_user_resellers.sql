-- Add active_tenant_id column to user_resellers for multi-tenant client selection
-- This tracks which specific tenant a reseller user is currently viewing/operating within
-- when the reseller manages multiple clients.

ALTER TABLE user_resellers
  ADD COLUMN IF NOT EXISTS active_tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL;

-- Create index for lookups
CREATE INDEX IF NOT EXISTS idx_user_resellers_active_tenant
  ON user_resellers(active_tenant_id);

-- Add comment
COMMENT ON COLUMN user_resellers.active_tenant_id IS
  'The specific tenant UUID currently selected by the user within this reseller stable. Used for multi-tenant scoping.';

DO $$
BEGIN
  RAISE NOTICE 'OVG-PLATFORM-V2: Added active_tenant_id to user_resellers';
END $$;