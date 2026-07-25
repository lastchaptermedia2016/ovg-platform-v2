ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS conversation_id UUID NOT NULL DEFAULT gen_random_uuid();

CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation_created ON chat_messages(conversation_id, created_at DESC);

ALTER TABLE conversation_mute_state ALTER COLUMN conversation_id TYPE UUID USING conversation_id::uuid;

CREATE INDEX IF NOT EXISTS idx_mute_conversation_tenant ON conversation_mute_state(conversation_id, tenant_id);
