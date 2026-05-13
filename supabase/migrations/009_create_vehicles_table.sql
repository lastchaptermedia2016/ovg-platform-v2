-- Migration: Create vehicles table for dealership module
-- This enables VIN-based vehicle tracking with NaTIS-ready JSONB payloads
-- from aggregators like Lightstone and TransUnion

-- Create vehicles table
CREATE TABLE IF NOT EXISTS vehicles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  vin TEXT UNIQUE NOT NULL,
  registration TEXT,
  make_model TEXT,
  year INTEGER,
  natis_payload JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_vehicles_vin ON vehicles(vin);
CREATE INDEX IF NOT EXISTS idx_vehicles_tenant_id ON vehicles(tenant_id);

-- Add comments for documentation
COMMENT ON TABLE vehicles IS 'Vehicle records linked to tenants for dealership module';
COMMENT ON COLUMN vehicles.vin IS 'Vehicle Identification Number (unique)';
COMMENT ON COLUMN vehicles.registration IS 'Vehicle registration/license plate number';
COMMENT ON COLUMN vehicles.make_model IS 'Make and model text (e.g., Toyota Hilux)';
COMMENT ON COLUMN vehicles.year IS 'Manufacturing year';
COMMENT ON COLUMN vehicles.natis_payload IS 'Full response from NaTIS aggregators (Lightstone/TransUnion) as JSONB';

-- Enable Row Level Security
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only access vehicles belonging to tenants they manage
-- This chains through: vehicles.tenant_id → tenants → user_resellers → auth.uid()
CREATE POLICY "users_access_own_tenant_vehicles" ON vehicles
  FOR ALL
  USING (tenant_id IN (
    SELECT t.id
    FROM tenants t
    JOIN user_resellers ur ON ur.reseller_id = t.reseller_id
    WHERE ur.user_id = auth.uid()
  ))
  WITH CHECK (tenant_id IN (
    SELECT t.id
    FROM tenants t
    JOIN user_resellers ur ON ur.reseller_id = t.reseller_id
    WHERE ur.user_id = auth.uid()
  ));

-- Add comment for security documentation
COMMENT ON POLICY "users_access_own_tenant_vehicles" ON vehicles IS 'Security policy - Users can only access vehicles belonging to tenants linked to their reseller accounts via user_resellers junction table';

-- Log the migration
DO $$
BEGIN
  RAISE NOTICE 'OVG-PLATFORM-V2: Created vehicles table with NaTIS-ready JSONB payload and RLS policy';
END $$;