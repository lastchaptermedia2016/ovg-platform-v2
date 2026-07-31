/**
 * Client System Registry
 *
 * Single source of truth for all client-accessible commands and capabilities
 * surfaced in the unified ClientSystemModal. Consolidates the previously
 * fragmented lists that lived in:
 *   - src/components/studio/CapabilitiesModal.tsx   (hardcoded strings)
 *   - src/components/client/ClientHelpModal.tsx     (FEATURE_REGISTRY, client scope)
 *   - src/components/client/CommandModal.tsx        (capability-registry, client entries)
 *
 * This is a curated union: the three sources are merged and deduplicated into
 * General / Branding / Persona categories. resellerSlug / permissionLevel
 * handling is intentionally dropped so no higher-privilege surface leaks into
 * the client UI.
 *
 * Client-safe: plain data + types only, no server-only imports.
 */

export type ClientSystemCategory = 'general' | 'branding' | 'persona' | 'memory';

export interface ClientSystemNavAction {
  type: 'nav';
  href: string;
  label: string;
}

export interface ClientSystemItem {
  id: string;
  label: string;
  description: string;
  /** Optional actionable entry, e.g. navigate to a Studio module. */
  action?: ClientSystemNavAction;
  /** Display-only hint that the underlying command requires auth. */
  requiresAuth?: boolean;
}

export const CLIENT_SYSTEM_TABS: { id: ClientSystemCategory; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'branding', label: 'Branding' },
  { id: 'persona', label: 'Persona' },
  { id: 'memory', label: 'Knowledge' },
];

export const PAGE_WELCOME_GREETINGS: Record<string, string> = {
  '/client': "Welcome to your main dashboard! How can I assist you with your AI agent today?",
  '/client/dashboard': "Welcome to your main dashboard! How can I assist you with your AI agent today?",
  '/client/dashboard/studio/branding': "Welcome to your branding page! How can I assist with your styling or widget layout?",
  '/client/dashboard/studio/persona': "Welcome to your persona studio! Ready to tune your assistant's identity or voice?",
  '/client/dashboard/memories': "Welcome to your knowledge base! What memories or rules would you like to update?",
  '/client/dashboard/analytics': "Welcome to your analytics dashboard! Would you like a breakdown of recent chats?",
  '/client/dashboard/settings': "Welcome to your settings hub! How can I help configure your portal?",
};

export const CLIENT_SYSTEM_REGISTRY: Record<ClientSystemCategory, ClientSystemItem[]> = {
  general: [
    {
      id: 'list_capabilities',
      label: 'List capabilities',
      description: 'Display available AI capabilities and commands.',
    },
    {
      id: 'explain',
      label: 'Explain behavior',
      description: 'Explain a capability, command, or system behavior.',
    },
    {
      id: 'no_match',
      label: 'Unrecognized intent',
      description: 'AI could not match your request to a known command.',
    },
    {
      id: 'view_analytics',
      label: 'View analytics',
      description: 'Show latest tenant performance metrics.',
    },
    {
      id: 'check_status',
      label: 'Check status',
      description: 'Display active pipeline health.',
    },
    {
      id: 'system_health',
      label: 'System health',
      description: 'Cognitive AI Brain, Neural Audio, Speech Output.',
    },
    {
      id: 'active_integrations',
      label: 'Active integrations',
      description: 'Webhook, Slack, Email, API.',
    },
    {
      id: 'success_rate',
      label: 'Success rate',
      description: '98.7% command success across the tenant.',
    },
    {
      id: 'avg_response',
      label: 'Avg response',
      description: '1.2s average command response time.',
    },
    {
      id: 'engagement_score',
      label: 'Engagement score',
      description: 'User interaction quality metrics.',
    },
  ],
  branding: [
    {
      id: 'update_branding',
      label: 'Update branding',
      description: 'Update your widget branding and AI persona configuration.',
      action: {
        type: 'nav',
        href: '/client/dashboard/studio/branding',
        label: 'Open Branding Studio',
      },
    },
    {
      id: 'branding_colors',
      label: 'Branding & Colors',
      description: 'Update Header Color, footer colors, logo, and widget position.',
    },
    {
      id: 'design_mirror',
      label: 'Design Mirror',
      description: 'Get live, on-brand layout recommendations as you edit.',
    },
    {
      id: 'apply_branding_theme',
      label: 'Apply branding theme',
      description: 'AI-suggested branding theme staged in the widget for confirmation.',
    },
  ],
  persona: [
    {
      id: 'ai_persona',
      label: 'AI Persona',
      description: 'Tune the assistant voice, tone, temperature, and conversation style.',
      action: {
        type: 'nav',
        href: '/client/dashboard/studio/persona',
        label: 'Open Persona Studio',
      },
    },
    {
      id: 'update_persona',
      label: 'Update persona',
      description: 'Update AI assistant name, greeting, voice, or system instructions.',
    },
    {
      id: 'configure_tone',
      label: 'Configure AI tone',
      description: 'Adjust voice persona settings.',
    },
    {
      id: 'response_style',
      label: 'Set response style',
      description: 'Modify communication patterns.',
    },
    {
      id: 'persona_status',
      label: 'Persona status',
      description: 'Current AI voice configuration.',
    },
    {
      id: 'sync_state',
      label: 'Sync state',
      description: 'Last persona update timestamp.',
    },
    {
      id: 'persona_guide',
      label: 'Persona guide',
      description: 'How to configure the AI voice.',
    },
    {
      id: 'voice_options',
      label: 'Voice options',
      description: 'Available voices and languages.',
    },
  ],
  memory: [
    {
      id: 'manage_memory',
      label: 'Manage knowledge base',
      description: 'Create, delete, or search knowledge-base memory entries.',
      action: {
        type: 'nav',
        href: '/client/dashboard/studio/knowledge',
        label: 'Open Knowledge Base',
      },
    },
    {
      id: 'publish_draft',
      label: 'Publish studio draft',
      description: 'Commit the current unsaved studio draft to live configuration.',
    },
  ],
};
