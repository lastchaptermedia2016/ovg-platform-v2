-- Create tenant_logs table for comprehensive audit logging of configuration changes
-- This table captures all mutations to tenant configurations with before/after snapshots

CREATE TABLE IF NOT EXISTS tenant_logs (
  -- Primary key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Audit context
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- Change classification
  action TEXT NOT NULL CHECK (action IN ('config_update', 'feature_flag_change')),
  change_type TEXT NOT NULL CHECK (change_type IN ('widget_config', 'custom_assets', 'branding')),
  
  -- Change data
  old_value JSONB NOT NULL,
  new_value JSONB NOT NULL,
  delta JSONB,
  
  -- Additional context
  metadata JSONB,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for efficient queries
-- Fast audit trail retrieval: tenant + reverse chronological order
CREATE INDEX idx_tenant_logs_tenant_created ON tenant_logs(tenant_id, created_at DESC);

-- Filtering by tenant
CREATE INDEX idx_tenant_logs_tenant ON tenant_logs(tenant_id);

-- User action tracking
CREATE INDEX idx_tenant_logs_user ON tenant_logs(user_id);

-- Enable Row-Level Security
ALTER TABLE tenant_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Authenticated users can read logs for tenants they own/manage
-- (joining through user_resellers relationship)
CREATE POLICY "Users can read logs for their tenants" ON tenant_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_resellers ur
      INNER JOIN tenants t ON ur.reseller_id = t.reseller_id
      WHERE ur.user_id = auth.uid()
        AND t.id = tenant_logs.tenant_id
    )
  );

-- RLS Policy: Only the API and service role can insert logs
CREATE POLICY "API can insert logs" ON tenant_logs
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

-- Comments for documentation
COMMENT ON TABLE tenant_logs IS 'Audit trail for configuration changes to tenants, including complete before/after snapshots and computed deltas';
COMMENT ON COLUMN tenant_logs.tenant_id IS 'Reference to the tenant that was modified';
COMMENT ON COLUMN tenant_logs.user_id IS 'Reference to the user who made the change (null for system actions)';
COMMENT ON COLUMN tenant_logs.action IS 'Type of action: config_update or feature_flag_change';
COMMENT ON COLUMN tenant_logs.change_type IS 'Category of configuration: widget_config, custom_assets, or branding';
COMMENT ON COLUMN tenant_logs.old_value IS 'Complete snapshot of configuration before the change';
COMMENT ON COLUMN tenant_logs.new_value IS 'Complete snapshot of configuration after the change';
COMMENT ON COLUMN tenant_logs.delta IS 'Computed diff showing only the fields that changed';
COMMENT ON COLUMN tenant_logs.metadata IS 'Optional context: user email, IP address, client info, etc.';
