-- Fix conversation_mute_state tenant_id FK to reference tenants(id) instead of tenants(tenant_id)
-- This aligns it with chat_messages which already uses tenants(id)

-- Drop the old FK
ALTER TABLE conversation_mute_state DROP CONSTRAINT IF EXISTS conversation_mute_state_tenant_id_fkey;

-- Convert tenant_id from TEXT to UUID to match tenants(id) and chat_messages.tenant_id
ALTER TABLE conversation_mute_state ALTER COLUMN tenant_id TYPE UUID USING tenant_id::uuid;

-- Add the corrected FK
ALTER TABLE conversation_mute_state 
  ADD CONSTRAINT conversation_mute_state_tenant_id_fkey 
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
