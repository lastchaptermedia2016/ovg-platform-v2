CREATE TABLE IF NOT EXISTS conversation_read_state (
  conversation_id UUID NOT NULL,
  user_id UUID NOT NULL,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_conversation_read_state_conversation
  ON conversation_read_state(conversation_id);

CREATE INDEX IF NOT EXISTS idx_conversation_read_state_user
  ON conversation_read_state(user_id);

COMMENT ON TABLE conversation_read_state IS 'Tracks per-user read cursors for chat conversations so unread state survives refresh.';
COMMENT ON COLUMN conversation_read_state.last_read_at IS 'Set to NOW() when the user views the conversation.';
