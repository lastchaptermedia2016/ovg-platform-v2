-- Add metadata JSONB column to tenants table for industry-specific settings
ALTER TABLE tenants
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- Add comment for documentation
COMMENT ON COLUMN tenants.metadata IS 'Industry-specific metadata (e.g., dealership inventory URL, sales lead settings)';

-- Create index on metadata for efficient querying of specific fields
CREATE INDEX IF NOT EXISTS idx_tenants_metadata_gin ON tenants USING GIN (metadata);
