export interface HelpArticle {
  summary: string;
  steps: string[];
  proTip?: string;
}

export const HELP_MATRIX: Record<string, HelpArticle> = {
  create_client: {
    summary: "Creating a new client establishes an isolated sub-tenant workspace within your reseller platform network.",
    steps: [
      "Navigate to the 'Clients' management grid via your primary dashboard sidebar.",
      "Click the '+ New Client' action button positioned in the top-right toolbar.",
      "Populate the company credentials profile. Note: Their designated reseller email will serve as their primary identifier for authentication paths (/auth).",
      "Assign their administrative login email and secure temporary password, then click save to provision the tenant space."
    ],
    proTip: "Once active, click directly into their client profile card to override layout stylesheets, customize graphic assets, or flip specific tenant feature flags."
  },
  branding: {
    summary: "The platform supports complete white-label presentation overrides per sub-tenant, including color spaces and image assets.",
    steps: [
      "Open your platform workspace and select the 'Settings' layout link from the menu navigation.",
      "Click into the 'Branding' configuration tab section.",
      "Upload your workspace graphics, set your custom theme hex codes, and refresh the active session to lock down the visual parameters."
    ],
    proTip: "Ensure your custom logos conform to transparent PNG specifications to blend seamlessly across both light and dark application frame contexts."
  },
  default: {
    summary: "I am analyzing your active workspace layer to assist you with operations.",
    steps: [
      "To add accounts or sub-tenants: Say 'How do I create a client?'.",
      "To alter themes and white-labeling: Say 'How do I update client branding?'.",
      "To filter down interactive data grids: Use terms like 'Filter clients by sector' or specify a target industry view directly."
    ]
  }
};

/**
 * Sweeps incoming transcription text to find intent keywords and returns a formatted guide.
 */
export function matchHelpIntent(userText: string): string {
  const normalized = userText.toLowerCase();
  let article = HELP_MATRIX.default;

  if (normalized.includes('create') && (normalized.includes('client') || normalized.includes('tenant'))) {
    article = HELP_MATRIX.create_client;
  } else if (normalized.includes('brand') || normalized.includes('logo') || normalized.includes('theme')) {
    article = HELP_MATRIX.branding;
  }

  const stepsText = article.steps.map((step, index) => `${index + 1}. ${step}`).join('\n');
  const proTipText = article.proTip ? `\n\n💡 Pro-Tip: ${article.proTip}` : '';

  return `${article.summary}\n\nHere is exactly how to execute this within the workspace:\n${stepsText}${proTipText}`;
}
