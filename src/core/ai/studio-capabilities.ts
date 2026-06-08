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
    description: 'Change the widget container background, opacity, chat window body transparency (bodyOpacity), chat body background color (bodyBackground), or overall visual properties. When bodyOpacity drops below 1.0, glassmorphism blur is automatically applied to the live preview canvas.',
    examples: [
      'Set widget opacity to 50%',
      'Make widget background transparent',
      'Set the chat window to semi-transparent white',
      'Make the message panel transparent',
      'Set widget body background to white with 30% opacity',
      'Make the text window see-through',
      'Apply a glassmorphic chat box effect',
      'Clear the message box background completely',
      'Set body opacity to 0.4 with a dark background',
    ],
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
  customCssSandbox: {
    key: 'customCssSandbox',
    description: 'A sandboxed code terminal beneath the Custom CSS toggle where users can inject raw CSS style overrides targeting the widget preview. The primary CSS selector is `.widget-container`. Supports glassmorphism effects like `backdrop-filter: blur(12px)`, alpha-channel backgrounds like `rgba(255,255,255,0.05)`, custom border-radius, and any standard CSS property.',
    examples: [
      'Add glassmorphism to the widget',
      'Set the chat panel border-radius to 16px',
      'Make the widget background semi-transparent white',
      'Apply a blur effect to the container',
      'How do I add custom CSS to my widget?',
    ],
  },
  logoManagement: {
    key: 'logoManagement',
    description: 'Handles white-label corporate asset injection. Allows tenants to upload custom logos to a secure storage container, generating a public HTTPS URL that updates the widget header. Manages branding configurations associated with payload.branding.logoUrl.',
    examples: [
      'Change my widget logo',
      'How do I upload a new brand image?',
      'Update the logo URL path',
      'Remove the custom logo from the header',
      'Replace the default branding icon',
    ],
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