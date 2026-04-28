-- Add signal tracking and analytics columns to tenants table
ALTER TABLE tenants 
ADD COLUMN IF NOT EXISTS last_seen TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS total_leads INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_revenue DECIMAL(10, 2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS signal_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS mrr DECIMAL(10, 2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS email TEXT,
ADD COLUMN IF NOT EXISTS industry TEXT DEFAULT 'general',
ADD COLUMN IF NOT EXISTS industry_config JSONB DEFAULT '{"features": [], "super_functions": []}'::jsonb,
ADD COLUMN IF NOT EXISTS ai_insight TEXT,
ADD COLUMN IF NOT EXISTS signal_trend INTEGER[] DEFAULT ARRAY[]::INTEGER[];

-- Add comments for documentation
COMMENT ON COLUMN tenants.last_seen IS 'Timestamp of last activity/signal from tenant';
COMMENT ON COLUMN tenants.total_leads IS 'Total number of leads generated';
COMMENT ON COLUMN tenants.total_revenue IS 'Total revenue generated';
COMMENT ON COLUMN tenants.signal_count IS 'Total number of signals processed';
COMMENT ON COLUMN tenants.mrr IS 'Monthly Recurring Revenue';
COMMENT ON COLUMN tenants.email IS 'Primary contact email';
COMMENT ON COLUMN tenants.industry IS 'Industry category (automotive, retail, healthcare, etc.)';
COMMENT ON COLUMN tenants.industry_config IS 'Industry-specific configuration including features and super functions';
COMMENT ON COLUMN tenants.ai_insight IS 'AI-generated insight summary';
COMMENT ON COLUMN tenants.signal_trend IS 'Array of signal counts for trend visualization';

-- Create index on last_seen for heartbeat monitoring
CREATE INDEX IF NOT EXISTS idx_tenants_last_seen ON tenants(last_seen);

-- Create index on industry for filtering
CREATE INDEX IF NOT EXISTS idx_tenants_industry ON tenants(industry);
