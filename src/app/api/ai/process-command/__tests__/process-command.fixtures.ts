// src/app/api/ai/process-command/__tests__/process-command.fixtures.ts
//
// Deterministic datasets for the /api/ai/process-command validation suite.
//
// IMPORTANT: the `cannedResponse.payload` shapes below are modeled against the
// REAL translation contract in translateVoicePayloadToStudioConfig.ts, NOT an
// assumed one. That function reads ONLY these keys:
//   theme.primary|secondary|logoUrl|opacity|backgroundType|primaryGradient*
//         |secondaryGradient*   -> branding.*
//   widget.bodyOpacity|bodyBackground (legacy: opacity|background) -> branding.*
//   behavior.prompt -> aiPersona.systemPrompt ; behavior.tone -> aiPersona.temperature
//   aiPersona.personaMode -> aiPersona.personaMode   (NOTE: aiPersona.name is DROPPED)
//   ui.aiInsightBadge|aiDesignMirror|customCss|customCssCode -> features.*
// Anything else (e.g. widget.header, behavior.name) is silently ignored.

export const PRE_LLM_THEME_FIXTURES = [
  { input: 'Apply the corporate legal theme', expectedTheme: 'legal' },
  { input: 'Switch my layout to modern clean style', expectedTheme: 'modern' },
  { input: 'Make the dashboard look bold and vibrant', expectedTheme: 'bold' },
  { input: 'I want a refined elegant design look', expectedTheme: 'elegant' },
  { input: 'Change the style to playful and fun', expectedTheme: 'playful' },
  { input: 'Set my workspace to corporate business mode', expectedTheme: 'corporate' },
];

export const PRE_LLM_HELP_FIXTURES = [
  'what can you do',
  'help',
  'list commands',
  'capabilities',
  'show commands',
];

export const PRE_LLM_TELEMETRY_FIXTURES = [
  'success rate',
  'performance metrics',
  'system health signals',
  'uptime stats',
];

export interface CapabilityFixture {
  example: string;
  cannedResponse: {
    actionType: string;
    targetIds: string[];
    payload: Record<string, unknown>;
    summary: string;
    confidenceScore: number;
  };
  expectedPersisted: Record<string, unknown>;
  llmDependent?: boolean;
}

export const CAPABILITY_FIXTURES: Record<string, CapabilityFixture[]> = {
  headerCustomization: [
    {
      example: 'Make the header a solid teal color',
      cannedResponse: {
        actionType: 'SYSTEM_UPDATE_BRANDING',
        targetIds: ['eca76a5b-de2a-41c9-b5e0-5ae7412ef835'],
        payload: {
          theme: { primary: '#008080', backgroundType: 'solid' },
        },
        summary: 'Configured a solid teal header fill.',
        confidenceScore: 0.99,
      },
      expectedPersisted: {
        branding: {
          primaryColor: '#008080',
          headerConfig: { type: 'solid', colorStart: '#008080' },
        },
      },
    },
  ],
  footer: [
    {
      example: 'Make the footer dark',
      cannedResponse: {
        actionType: 'SYSTEM_UPDATE_BRANDING',
        targetIds: ['eca76a5b-de2a-41c9-b5e0-5ae7412ef835'],
        payload: {
          theme: { secondaryGradientStart: '#1a1a1a', secondaryGradientEnd: '#1a1a1a' },
        },
        summary: 'Applied a dark footer gradient.',
        confidenceScore: 0.98,
      },
      expectedPersisted: {
        branding: {
          footerConfig: { colorStart: '#1a1a1a', colorEnd: '#1a1a1a' },
        },
      },
    },
  ],
  widget: [
    {
      example: 'Set widget opacity to 50%',
      cannedResponse: {
        actionType: 'SYSTEM_UPDATE_BRANDING',
        targetIds: ['eca76a5b-de2a-41c9-b5e0-5ae7412ef835'],
        payload: {
          widget: { bodyOpacity: 0.5 },
        },
        summary: 'Set the widget body opacity to 50%.',
        confidenceScore: 0.98,
      },
      expectedPersisted: {
        branding: {
          widgetBodyOpacity: 0.5,
        },
      },
    },
  ],
  addons: [
    {
      example: 'Enable the AI insight badge overlay and turn on the design mirror feature',
      cannedResponse: {
        actionType: 'SYSTEM_UPDATE_BRANDING',
        targetIds: ['eca76a5b-de2a-41c9-b5e0-5ae7412ef835'],
        payload: {
          ui: { aiInsightBadge: true, aiDesignMirror: true },
        },
        summary: 'Activated the insight badge and design mirror.',
        confidenceScore: 0.97,
      },
      expectedPersisted: {
        features: {
          aiInsightBadge: true,
          aiDesignMirror: true,
        },
      },
    },
  ],
  customCssSandbox: [
    {
      example: 'Turn on custom style overrides and hide the brand footer line',
      cannedResponse: {
        actionType: 'SYSTEM_UPDATE_BRANDING',
        targetIds: ['eca76a5b-de2a-41c9-b5e0-5ae7412ef835'],
        payload: {
          ui: { customCss: true },
        },
        summary: 'Enabled custom CSS overrides.',
        confidenceScore: 0.96,
      },
      expectedPersisted: {
        features: {
          customCss: true,
        },
      },
    },
  ],
  vibe: [
    {
      example: 'Switch the assistant to concierge mode and set the header teal',
      // Combined persona + branding change so it is NOT caught by the
      // persona-only early-return (route.ts:649) and actually persists.
      // translateVoicePayloadToStudioConfig projects aiPersona.personaMode and
      // theme.primary/backgroundType -> branding.headerConfig.
      cannedResponse: {
        actionType: 'SYSTEM_UPDATE_BRANDING',
        targetIds: ['eca76a5b-de2a-41c9-b5e0-5ae7412ef835'],
        payload: {
          aiPersona: { personaMode: 'concierge' },
          theme: { primary: '#008080', backgroundType: 'solid' },
        },
        summary: 'Switched to concierge and set a teal header.',
        confidenceScore: 0.95,
      },
      expectedPersisted: {
        branding: {
          primaryColor: '#008080',
          headerConfig: { type: 'solid', colorStart: '#008080' },
        },
        aiPersona: { personaMode: 'concierge' },
      },
    },
  ],
};
