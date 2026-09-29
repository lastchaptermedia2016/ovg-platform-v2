-- Migration: add channel discriminator to chat_messages
-- Purpose: isolate system/voice-command feedback rows from public widget chats
-- so the Live Chat Inbox conversation list only surfaces real customer conversations.

ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'widget';

ALTER TABLE chat_messages
  DROP CONSTRAINT IF EXISTS chat_messages_channel_check;

ALTER TABLE chat_messages
  ADD CONSTRAINT chat_messages_channel_check
  CHECK (channel IN ('widget', 'system'));

CREATE INDEX IF NOT EXISTS idx_chat_messages_tenant_channel_created
  ON chat_messages(tenant_id, channel, created_at DESC);

COMMENT ON COLUMN chat_messages.channel IS 'Surface the message originated from: widget (customer chat) or system (voice-command feedback)';