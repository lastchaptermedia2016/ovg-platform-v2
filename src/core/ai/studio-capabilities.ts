/**
 * Canonical Studio Capabilities Schema for the Branding Studio.
 * 
 * This is the single source of truth for what the AI agent (Hannah)
 * can do when the user is on the /branding route.
 * 
 * ⚠️ KEEP IN SYNC with the STUDIO_CAPABILITIES constant in
 *    src/components/reseller/ClientBrandingStudio.tsx
 * 
 * FUTURE CAPABILITIES: Add a new key to this object AND the frontend
 * constant. The system prompt will automatically include it.
 */

export interface StudioCapability {
  key: string;
  description: string;
  examples: string[];
}

export interface StudioCapabilitiesMap {
  [key: string]: StudioCapability;
}

export const STUDIO_CAPABILITIES: StudioCapabilitiesMap = {
  header: {
    key: 'header',
    description: 'Change the header background color, gradient, image, or opacity.',
    examples: ['Set the header to blue', 'Make the header gradient'],
  },
  footer: {
    key: 'footer',
    description: 'Change the footer background color, gradient, image, or opacity.',
    examples: ['Make the footer dark', 'Set footer opacity to 80%'],
  },
  widget: {
    key: 'widget',
    description: 'Change the widget container background, opacity, or overall visual properties.',
    examples: ['Set widget opacity to 50%', 'Make widget background transparent'],
  },
  vibe: {
    key: 'vibe',
    description: 'Apply an aesthetic vibe to the entire branding palette.',
    examples: ['Make it cyberpunk neon', 'Apply a minimalist style'],
  },
  addons: {
    key: 'addons',
    description: 'Toggle AI features like the Insight Badge, Design Mirror, or Custom CSS.',
    examples: ['Enable the insight badge', 'Turn off design mirror'],
  },
  applyBrandVibe: {
    key: 'applyBrandVibe',
    description: 'Apply an aesthetic vibe by name to the entire branding palette.',
    examples: ['Apply a cyberpunk neon vibe', 'Make it minimalist luxury'],
  },
  saveStudioConfig: {
    key: 'saveStudioConfig',
    description: 'Commit and persist all current branding settings to the client record.',
    examples: ['Save my changes', 'Commit the branding config'],
  },
  triggerAIMagic: {
    key: 'triggerAIMagic',
    description: 'Run a full automated designer optimization pass on the active layout.',
    examples: ['Run AI magic', 'Optimize my design'],
  },
};

/**
 * All capability keys for quick iteration and validation.
 */
export const ALL_STUDIO_KEYS = Object.keys(STUDIO_CAPABILITIES);

/**
 * Build a human-readable "Operating Manual" block for injection
 * into the DEPLOYMENT_OFFICER system prompt.
 * 
 * The agent can parse this structure naturally. Adding a new capability
 * here means the agent will automatically know how to explain it.
 */
export function buildCapabilitiesPrompt(
  capabilities: StudioCapabilitiesMap = STUDIO_CAPABILITIES
): string {
  return Object.entries(capabilities)
    .map(([_key, cap]) =>
      `  - "${cap.key}": ${cap.description}\n    Example commands: ${cap.examples.map(e => `"${e}"`).join(', ')}`
    )
    .join('\n');
}

/**
 * Build a conversational "I can help you..." summary string
 * for deterministic (pre-LLM) SYSTEM_HELP responses.
 */
export function buildCapabilitiesSummary(
  capabilities: StudioCapabilitiesMap = STUDIO_CAPABILITIES
): string {
  const sections = Object.values(capabilities).map(cap => cap.description.toLowerCase());
  return sections.join(' I can also ');
}