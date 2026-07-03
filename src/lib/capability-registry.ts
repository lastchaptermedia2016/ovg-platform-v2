/**
 * Capability Registry
 * Central mapping of voice capabilities with permission levels and context paths.
 */

export type PermissionLevel = 'client' | 'reseller';

export type ContextPath = '/client/dashboard' | '/reseller/dashboard' | '/client' | '/reseller';

export interface CapabilityItem {
  label: string;
  description: string;
}

export interface CapabilityEntry {
  capabilities: Record<string, CapabilityItem[]>;
}

export interface CommandCapability {
  id: string;
  intent: string;
  permissionLevel: PermissionLevel[];
  contextPath: ContextPath;
  branding?: CapabilityEntry;
  persona?: CapabilityEntry;
}

const registry: CommandCapability[] = [
  {
    id: 'client-dashboard-001',
    intent: 'list_capabilities',
    permissionLevel: ['client', 'reseller'],
    contextPath: '/client/dashboard',
    branding: {
      capabilities: {
        list_capabilities: [
          { label: 'View analytics', description: 'Show latest tenant performance metrics' },
          { label: 'Update configuration', description: 'Modify branding and persona settings' },
          { label: 'Check status', description: 'Display active pipeline health' },
        ],
      },
    },
    persona: {
      capabilities: {
        list_capabilities: [
          { label: 'Configure AI tone', description: 'Adjust voice persona settings' },
          { label: 'Set response style', description: 'Modify communication patterns' },
        ],
      },
    },
  },
  {
    id: 'client-dashboard-002',
    intent: 'view_status',
    permissionLevel: ['client', 'reseller'],
    contextPath: '/client/dashboard',
    branding: {
      capabilities: {
        view_status: [
          { label: 'System health', description: 'Cognitive AI Brain, Neural Audio, Speech Output' },
          { label: 'Active integrations', description: 'Webhook, Slack, Email, API' },
        ],
      },
    },
    persona: {
      capabilities: {
        view_status: [
          { label: 'Persona status', description: 'Current AI voice configuration' },
          { label: 'Sync state', description: 'Last persona update timestamp' },
        ],
      },
    },
  },
  {
    id: 'client-dashboard-003',
    intent: 'get_help',
    permissionLevel: ['client', 'reseller'],
    contextPath: '/client/dashboard',
    branding: {
      capabilities: {
        get_help: [
          { label: 'Commands', description: 'List available voice commands' },
          { label: 'Permissions', description: 'Show what the AI can execute' },
        ],
      },
    },
    persona: {
      capabilities: {
        get_help: [
          { label: 'Persona guide', description: 'How to configure AI voice' },
          { label: 'Voice options', description: 'Available voices and languages' },
        ],
      },
    },
  },
  {
    id: 'client-dashboard-004',
    intent: 'show_analytics',
    permissionLevel: ['client', 'reseller'],
    contextPath: '/client/dashboard',
    branding: {
      capabilities: {
        show_analytics: [
          { label: 'Success rate', description: '98.7%' },
          { label: 'Avg response', description: '1.2s' },
        ],
      },
    },
    persona: {
      capabilities: {
        show_analytics: [
          { label: 'Engagement score', description: 'User interaction quality metrics' },
        ],
      },
    },
  },
  {
    id: 'reseller-dashboard-001',
    intent: 'list_capabilities',
    permissionLevel: ['reseller'],
    contextPath: '/reseller/dashboard',
    branding: {
      capabilities: {
        list_capabilities: [
          { label: 'Manage clients', description: 'Create, update, and delete client tenants' },
          { label: 'Deploy branding', description: 'Push widget themes and custom CSS' },
          { label: 'View telemetry', description: 'Portfolio-wide success rates and metrics' },
        ],
      },
    },
    persona: {
      capabilities: {
        list_capabilities: [
          { label: 'Batch assign personas', description: 'Apply AI personas across clients' },
          { label: 'Clone tenant config', description: 'Duplicate branding + persona to new tenant' },
        ],
      },
    },
  },
  {
    id: 'reseller-dashboard-002',
    intent: 'view_status',
    permissionLevel: ['reseller'],
    contextPath: '/reseller/dashboard',
    branding: {
      capabilities: {
        view_status: [
          { label: 'Reseller health', description: 'Active clients, signal throughput, API usage' },
          { label: 'Revenue metrics', description: 'Billing, usage tiers, and overages' },
        ],
      },
    },
    persona: {
      capabilities: {
        view_status: [
          { label: 'Persona adoption', description: 'Client persona usage across portfolio' },
        ],
      },
    },
  },
  {
    id: 'reseller-dashboard-003',
    intent: 'get_help',
    permissionLevel: ['reseller'],
    contextPath: '/reseller/dashboard',
    branding: {
      capabilities: {
        get_help: [
          { label: 'Deployment commands', description: 'Voice-driven client provisioning' },
          { label: 'Bulk operations', description: 'Multi-tenant updates and filters' },
        ],
      },
    },
    persona: {
      capabilities: {
        get_help: [
          { label: 'Persona bulk-apply', description: 'Voice command to assign personas to tenants' },
        ],
      },
    },
  },
  {
    id: 'reseller-dashboard-004',
    intent: 'show_analytics',
    permissionLevel: ['reseller'],
    contextPath: '/reseller/dashboard',
    branding: {
      capabilities: {
        show_analytics: [
          { label: 'Client growth', description: 'New tenants and churn rate' },
          { label: 'API usage', description: 'Rate limits, TPM, and error budget' },
        ],
      },
    },
    persona: {
      capabilities: {
        show_analytics: [
          { label: 'Persona performance', description: 'Custom persona success rates' },
        ],
      },
    },
  },
];

export type CapabilityMode = 'branding' | 'persona';

/**
 * Get capabilities for a specific context, permission level, intent, and mode.
 */
export function getCapabilities(
  contextPath: ContextPath,
  _permissionLevel: PermissionLevel,
  intent: string,
  mode: CapabilityMode = 'branding'
): CapabilityItem[] {
  const entry = registry.find(
    (c) => c.contextPath === contextPath && c.intent === intent
  );

  if (!entry) {
    return [];
  }

  const category = mode === 'persona' ? entry.persona : entry.branding;

  if (!category || !category.capabilities[intent]) {
    return [];
  }

  return category.capabilities[intent];
}

/**
 * Get all capabilities for a mode across all matching entries.
 */
export function getCapabilitiesForMode(
  contextPath: ContextPath,
  permissionLevel: PermissionLevel,
  mode: CapabilityMode = 'branding'
): CapabilityItem[] {
  const results: CapabilityItem[] = [];

  registry.forEach((entry) => {
    if (entry.contextPath === contextPath && entry.permissionLevel.includes(permissionLevel)) {
      const category = mode === 'persona' ? entry.persona : entry.branding;
      if (category) {
        Object.values(category.capabilities).forEach((items) => {
          results.push(...items);
        });
      }
    }
  });

  return results;
}

/**
 * Get all capabilities available to a permission level across all contexts.
 * Used for "what can you do" / list_capabilities intent to show system-wide capabilities.
 */
export function getAllCapabilities(permissionLevel: PermissionLevel): CapabilityItem[] {
  const results: CapabilityItem[] = [];
  const seen = new Set<string>();

  registry.forEach((entry) => {
    if (entry.permissionLevel.includes(permissionLevel)) {
      // Merge both branding and persona capabilities
      const categories = [entry.branding, entry.persona].filter(Boolean) as CapabilityEntry[];
      categories.forEach((category) => {
        Object.values(category.capabilities).forEach((items) => {
          items.forEach((item) => {
            const key = `${item.label}-${item.description}`;
            if (!seen.has(key)) {
              seen.add(key);
              results.push(item);
            }
          });
        });
      });
    }
  });

  return results;
}

/**
 * Resolve the current context path from window.location.
 */
export function resolveContextPath(): ContextPath {
  const path = window.location.pathname;

  if (path.startsWith('/reseller/')) {
    return '/reseller/dashboard';
  }

  if (path.startsWith('/client/')) {
    return '/client/dashboard';
  }

  return '/client/dashboard';
}

/**
 * Resolve permission level from client profile.
 */
export function resolvePermissionLevel(profile: { resellerSlug?: string } | null | undefined): PermissionLevel {
  return profile?.resellerSlug ? 'reseller' : 'client';
}
