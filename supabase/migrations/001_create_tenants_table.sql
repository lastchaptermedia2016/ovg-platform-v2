-- Create tenants table for multi-tenant architecture
CREATE TABLE IF NOT EXISTS tenants (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  branding_color TEXT DEFAULT '#0097b2',
  voice_id TEXT,
  system_prompt TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on slug for lightning-fast lookups
CREATE INDEX IF NOT EXISTS idx_tenants_slug ON tenants(slug);

-- Add comment for documentation
COMMENT ON TABLE tenants IS 'Multi-tenant configuration table for white-label SaaS';
COMMENT ON COLUMN tenants.slug IS 'Unique identifier for tenant URLs (e.g., demo, client-name)';
COMMENT ON COLUMN tenants.branding_color IS 'Primary brand color in hex format';
COMMENT ON COLUMN tenants.voice_id IS 'Preferred voice ID for TTS';
COMMENT ON COLUMN tenants.system_prompt IS 'AI system prompt for LLM customization';
