-- Live chat message log for the client Studio.
-- One row per message; realtime is delivered via postgres_changes.
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX idx_chat_messages_tenant_created ON chat_messages(tenant_id, created_at DESC);

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- SELECT: authenticated users can read messages for tenants they own/manage.
CREATE POLICY "Users can read chat messages for their tenants" ON chat_messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_resellers ur
      INNER JOIN tenants t ON ur.reseller_id = t.reseller_id
      WHERE ur.user_id = auth.uid()
        AND t.id = chat_messages.tenant_id
    )
  );

-- INSERT: users can post only to their own tenant, and only as themselves.
CREATE POLICY "Users can insert own chat messages" ON chat_messages
  FOR INSERT
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM user_resellers ur
      INNER JOIN tenants t ON ur.reseller_id = t.reseller_id
      WHERE ur.user_id = auth.uid()
        AND t.id = chat_messages.tenant_id
    )
  );

COMMENT ON TABLE chat_messages IS 'Real-time chat messages between a client and their tenant';
COMMENT ON COLUMN chat_messages.tenant_id IS 'Tenant the conversation belongs to';
COMMENT ON COLUMN chat_messages.sender_id IS 'auth.users id of the message author';
COMMENT ON COLUMN chat_messages.content IS 'Message body';
