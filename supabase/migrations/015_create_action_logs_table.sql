-- Create the action_logs table
CREATE TABLE action_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id TEXT NOT NULL,
  tenant_id UUID NOT NULL,
  user_id UUID NOT NULL,
  source TEXT NOT NULL,
  params JSONB,
  result JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE action_logs ENABLE ROW LEVEL SECURITY;

-- Create Insert Policy
CREATE POLICY "users_insert_own_tenant_action_logs" ON action_logs
  FOR INSERT
  WITH CHECK (tenant_id IN (
    SELECT t.id FROM tenants t
    JOIN user_resellers ur ON ur.reseller_id = t.reseller_id
    WHERE ur.user_id = auth.uid()
  ));