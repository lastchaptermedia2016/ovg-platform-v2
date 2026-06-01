/**
 * System Capabilities Knowledge Base for Hannah's conversational guidance.
 *
 * Each command key maps to a structured description, usage examples, and parameters.
 * Used by the DEPLOYMENT_OFFICER persona to generate SYSTEM_EXPLAIN responses
 * and by the frontend to render contextual help in the command modal.
 */
export interface CommandCapability {
  key: string;
  name: string;
  description: string;
  examples: string[];
  parameters?: string[];
  seeAlso?: string[];
}

export const SYSTEM_CAPABILITIES: Record<string, CommandCapability> = {
  DELETE_CLIENT: {
    key: 'DELETE_CLIENT',
    name: 'Delete a Client',
    description:
      'Removes a client tenant from your portfolio. Hannah will confirm the client name before executing. This action cannot be undone.',
    examples: [
      'Delete BMW Test',
      'Remove client John Doe Motors',
      'Deactivate ABC Services',
    ],
    parameters: ['clientName: The exact name of the client to delete'],
    seeAlso: ['SYSTEM_DISARM'],
  },
  SYSTEM_FILTER_GRID: {
    key: 'SYSTEM_FILTER_GRID',
    name: 'Filter Clients by Category',
    description:
      'Filters the client grid to show only clients in a specific industry sector. Use this to focus on a particular segment of your portfolio.',
    examples: [
      'Filter by automotive',
      'Show only retail clients',
      'Switch to healthcare',
      'Filter insurance',
    ],
    parameters: [
      'category: AUTOMOTIVE, RETAIL, HEALTHCARE, INSURANCE, GENERAL',
    ],
  },
  SYSTEM_BULK_CONFIRM: {
    key: 'SYSTEM_BULK_CONFIRM',
    name: 'Confirm Bulk Action',
    description:
      'Confirms a pending bulk update operation. When Hannah asks "Should I proceed with the update?", use this command to confirm and apply the changes.',
    examples: ['Yes', 'Confirm', 'Go ahead', 'Proceed'],
  },
  SYSTEM_BULK_CANCEL: {
    key: 'SYSTEM_BULK_CANCEL',
    name: 'Cancel Bulk Action',
    description:
      'Cancels a pending bulk update operation. No changes will be made and the system returns to standby.',
    examples: ['No', 'Cancel', 'Stop', 'Wait', 'Hold on'],
  },
  SYSTEM_DISARM: {
    key: 'SYSTEM_DISARM',
    name: 'Disarm / Reset Session',
    description:
      'Resets the current session back to standby. Clears any selected client, command input, and returns to the default safe state.',
    examples: [
      'Never mind',
      'Forget it',
      'Disarm',
      'Reset',
      'Start over',
      'Go back',
    ],
  },
  SYSTEM_HELP: {
    key: 'SYSTEM_HELP',
    name: 'Show Available Commands',
    description:
      'Displays a glassmorphic overlay with all available voice commands. Hannah will also speak a summary of what she can do.',
    examples: [
      'What can you do?',
      'Help',
      'List commands',
      'Show commands',
      'What are my options?',
    ],
  },
  SYSTEM_NOTE: {
    key: 'SYSTEM_NOTE',
    name: 'Conversational Response',
    description:
      'When Hannah detects conversational input rather than a command, she will acknowledge you politely and wait for a clear instruction. The system remains in standby.',
    examples: ['Hello', 'Good morning', 'How are you today?'],
  },
  NO_MATCH: {
    key: 'NO_MATCH',
    name: 'Unrecognized Command',
    description:
      "When Hannah cannot match your input to any known command, she will let you know and ask you to try again. Don't worry — the system stays safe.",
    examples: ['How do I do this?', 'Not sure what to say'],
  },
  SINGLE: {
    key: 'SINGLE',
    name: 'Single Client Update',
    description:
      'Applies configuration changes to a single selected client. First select a client card by clicking it, then speak your changes. Hannah will apply the update immediately.',
    examples: [
      'Change the primary color to blue',
      'Enable the insight badge',
      'Update the branding for this client',
    ],
    parameters: [
      'theme: Color and style changes (primary, secondary, gradient)',
      'ui: Feature toggles (badge, design mirror, custom CSS)',
      'behavior: Prompt text and tone settings',
    ],
  },
  BULK: {
    key: 'BULK',
    name: 'Bulk Update Multiple Clients',
    description:
      'Applies configuration changes to multiple clients at once. Hannah will ask for your confirmation before executing the bulk update.',
    examples: [
      'Update all automotive clients',
      'Change color for retail clients',
      'Apply dark theme to all',
    ],
    parameters: [
      'targetIds: The clients to update (determined by your category filter)',
      'payload: The configuration changes to apply',
    ],
    seeAlso: ['SYSTEM_BULK_CONFIRM', 'SYSTEM_BULK_CANCEL'],
  },
  SYSTEM_UPDATE_BRANDING: {
    key: 'SYSTEM_UPDATE_BRANDING',
    name: 'Branding / Design Commands',
    description:
      'Apply visual design changes such as colors, gradients, logos, and feature toggles. Supports predefined vibe presets or custom hex values.',
    examples: [
      'Make it cyberpunk neon',
      'Set the logo to my image',
      'Enable design mirror',
      'Apply a minimalist style',
    ],
    parameters: [
      'theme: Primary, secondary, gradient colors, opacity',
      'ui: aiInsightBadge, aiDesignMirror, customCss',
      'logoUrl: Custom logo URL',
    ],
    seeAlso: ['SINGLE', 'BULK'],
  },
};

/**
 * All command keys for quick iteration and validation.
 */
export const ALL_COMMAND_KEYS = Object.keys(SYSTEM_CAPABILITIES);

/**
 * Resolves a natural language query to the closest command key.
 * Uses substring matching on command name, description, and examples.
 * Returns the matched key or null if no reasonable match.
 */
export function resolveContextKey(query: string): string | null {
  if (!query || query.trim().length < 2) return null;

  const normalized = query.toLowerCase().trim();

  // Direct key match
  if (SYSTEM_CAPABILITIES[normalized.toUpperCase()]) {
    return normalized.toUpperCase();
  }

  // Search through all capabilities
  for (const [key, capability] of Object.entries(SYSTEM_CAPABILITIES)) {
    // Match against name
    if (capability.name.toLowerCase().includes(normalized)) return key;
    // Match against description
    if (capability.description.toLowerCase().includes(normalized)) return key;
    // Match against examples
    for (const example of capability.examples) {
      if (example.toLowerCase().includes(normalized)) return key;
    }
  }

  return null;
}