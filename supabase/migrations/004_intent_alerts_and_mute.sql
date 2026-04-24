-- Intent Detection Alerts & AI Mute Mechanism Schema

-- Table for intent-triggered alerts
CREATE TABLE IF NOT EXISTS intent_alerts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  reseller_id UUID REFERENCES resellers(id) ON DELETE CASCADE,
  
  -- Intent details
  intent_type TEXT NOT NULL CHECK (intent_type IN (
    'pricing', 'frustration', 'human_request', 'sales_opportunity', 'complaint', 'urgent'
  )),
  trigger_word TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  confidence DECIMAL(3,2) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  
  -- Message preview
  message_preview TEXT,
  suggested_action TEXT,
  
  -- Status tracking
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'viewed', 'acknowledged', 'resolved')),
  acknowledged_by UUID,
  acknowledged_at TIMESTAMP WITH TIME ZONE,
  
  -- Deep link for dashboard
  deep_link TEXT,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_intent_alerts_tenant ON intent_alerts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_intent_alerts_reseller ON intent_alerts(reseller_id);
CREATE INDEX IF NOT EXISTS idx_intent_alerts_status ON intent_alerts(status);
CREATE INDEX IF NOT EXISTS idx_intent_alerts_created ON intent_alerts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_intent_alerts_conversation ON intent_alerts(conversation_id);

-- Composite index for dashboard queries
CREATE INDEX IF NOT EXISTS idx_intent_alerts_reseller_status ON intent_alerts(reseller_id, status, created_at DESC);

-- AI Mute State Table
CREATE TABLE IF NOT EXISTS conversation_mute_state (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id TEXT UNIQUE NOT NULL,
  tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  
  -- Mute state
  is_ai_muted BOOLEAN DEFAULT false,
  is_human_taking_over BOOLEAN DEFAULT false,
  
  -- Human agent details
  human_agent_id UUID,
  human_agent_name TEXT,
  
  -- Handover metadata
  handover_reason TEXT,
  handover_initiated_at TIMESTAMP WITH TIME ZONE,
  
  -- Auto-re-enable settings
  auto_reenable_ai BOOLEAN DEFAULT true,
  reenable_after_minutes INTEGER DEFAULT 30,
  scheduled_reenable_at TIMESTAMP WITH TIME ZONE,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for mute state
CREATE INDEX IF NOT EXISTS idx_mute_conversation ON conversation_mute_state(conversation_id);
CREATE INDEX IF NOT EXISTS idx_mute_tenant ON conversation_mute_state(tenant_id);
CREATE INDEX IF NOT EXISTS idx_mute_ai_muted ON conversation_mute_state(is_ai_muted) WHERE is_ai_muted = true;

-- Enable RLS
ALTER TABLE intent_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_mute_state ENABLE ROW LEVEL SECURITY;

-- RLS Policies for intent_alerts
CREATE POLICY "resellers_see_own_alerts" ON intent_alerts
  FOR ALL
  TO authenticated
  USING (
    reseller_id = (current_setting('request.jwt.claims', true)::json->>'reseller_id')::UUID
    OR (current_setting('request.jwt.claims', true)::json->>'role') = 'master'
  );

CREATE POLICY "service_role_alerts" ON intent_alerts
  FOR ALL
  TO service_role
  USING (true);

-- RLS Policies for conversation_mute_state
CREATE POLICY "resellers_manage_mute" ON conversation_mute_state
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tenants t 
      WHERE t.tenant_id = conversation_mute_state.tenant_id 
      AND t.reseller_id = (current_setting('request.jwt.claims', true)::json->>'reseller_id')::UUID
    )
    OR (current_setting('request.jwt.claims', true)::json->>'role') = 'master'
  );

CREATE POLICY "service_role_mute" ON conversation_mute_state
  FOR ALL
  TO service_role
  USING (true);

-- Function to auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
CREATE TRIGGER update_intent_alerts_updated_at
  BEFORE UPDATE ON intent_alerts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_mute_state_updated_at
  BEFORE UPDATE ON conversation_mute_state
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Comments
COMMENT ON TABLE intent_alerts IS 'Stores high-value intent detection alerts for reseller dashboards';
COMMENT ON TABLE conversation_mute_state IS 'Tracks AI mute state when human agents take over conversations';
COMMENT ON COLUMN intent_alerts.severity IS 'Priority level: critical requires immediate attention';
COMMENT ON COLUMN conversation_mute_state.is_human_taking_over IS 'When true, AI auto-replies are disabled';
