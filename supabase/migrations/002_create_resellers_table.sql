-- Create resellers table for multi-tenant reseller management
CREATE TABLE IF NOT EXISTS resellers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  branding_color TEXT DEFAULT '#0097b2',
  accent_color TEXT DEFAULT '#D4AF37',
  logo_url TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on tenant_id for lightning-fast lookups
CREATE INDEX IF NOT EXISTS idx_resellers_tenant_id ON resellers(tenant_id);

-- Add comment for documentation
COMMENT ON TABLE resellers IS 'Reseller accounts for white-label SaaS platform';
COMMENT ON COLUMN resellers.tenant_id IS 'Unique identifier for reseller URLs (e.g., acme-corp)';
COMMENT ON COLUMN resellers.branding_color IS 'Primary brand color in hex format';
COMMENT ON COLUMN resellers.accent_color IS 'Accent brand color in hex format';
COMMENT ON COLUMN resellers.logo_url IS 'URL to reseller logo asset';
COMMENT ON COLUMN resellers.is_active IS 'Whether the reseller account is active';

-- Add reseller_id to tenants table for strict data isolation
ALTER TABLE tenants 
ADD COLUMN IF NOT EXISTS reseller_id UUID REFERENCES resellers(id) ON DELETE CASCADE;

-- Create index on reseller_id for fast filtering
CREATE INDEX IF NOT EXISTS idx_tenants_reseller_id ON tenants(reseller_id);

-- Add comment for documentation
COMMENT ON COLUMN tenants.reseller_id IS 'Foreign key to resellers table for multi-tenant isolation';
