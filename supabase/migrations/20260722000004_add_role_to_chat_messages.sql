ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'visitor';

UPDATE chat_messages SET role = 'visitor' WHERE role IS NULL;

ALTER TABLE chat_messages ADD CONSTRAINT chat_messages_role_check CHECK (role IN ('visitor', 'agent', 'assistant'));

COMMENT ON COLUMN chat_messages.role IS 'Sender role: visitor, agent, or assistant';
