export interface ConversationSummary {
  id: string;
  label: string;
  lastMessageAt: string | null;
  messageCount: number;
  lastReadAt: string | null;
  hasUnread: boolean;
  muteState?: {
    isAiMuted: boolean;
    isHumanTakingOver: boolean;
    scheduledReenableAt: string | null;
  };
}

export interface ChatMessage {
  id: string;
  tenant_id: string;
  sender_id: string | null;
  message: string;
  created_at: string;
  role: 'visitor' | 'agent';
  conversation_id: string;
}

export interface LiveChatInboxProps {
  tenantId: string;
  accessToken?: string | null;
}
