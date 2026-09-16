/**
 * @file definition-knowledge-base.ts
 *
 * Client-safe platform terminology and FAQ definitions.
 * Used for deterministic, offline-safe answers to definition queries
 * ("What is Zeeder?", "Explain signals", "What are integrations?").
 *
 * This enables fast, cached responses without an LLM round-trip,
 * improving latency for FAQ-style definition questions.
 */

export interface DefinitionEntry {
  keywords: string[]; // Regex patterns to match against the query
  title: string; // The term being defined
  definition: string; // The definition/explanation
}

export const PLATFORM_DEFINITIONS: DefinitionEntry[] = [
  {
    keywords: ['zeeder', 'platform', 'system', 'what is zeeder', 'what are you'],
    title: 'Zeeder',
    definition:
      'Zeeder is an AI-powered client portal platform that lets you manage your business presence, ' +
      'configure your AI assistant\'s personality (called "personas"), customize branding, and track ' +
      'customer engagement metrics. It\'s your central hub for white-label customer interaction and ' +
      'intelligence gathering.',
  },
  {
    keywords: ['signal', 'signals', 'what is a signal', 'what are signals', 'signals feature'],
    title: 'Signals (Engagement Metrics)',
    definition:
      'Signals are real-time engagement metrics that track how customers interact with your AI assistant. ' +
      'They capture sentiment, conversation topics, booking intent, and satisfaction signals so you understand ' +
      'customer needs at a glance. Use the Telemetry dashboard to see these metrics rolled up by date range.',
  },
  {
    keywords: ['persona', 'personae', 'ai personality', 'assistant personality', 'what is a persona'],
    title: 'AI Persona',
    definition:
      'A Persona is the AI assistant\'s unique identity: its name, voice tone, greeting style, and behavioral rules. ' +
      'Zeeder ships with two default personas — "Concierge" (warm, service-oriented) and "Sales" (product-focused) — ' +
      'but you can customize any aspect. Your customers interact with the persona you configure in the Studio.',
  },
  {
    keywords: ['branding', 'what is branding', 'brand', 'widget branding', 'client branding'],
    title: 'Branding',
    definition:
      'Branding in Zeeder lets you customize the visual appearance and messaging of your AI assistant widget. ' +
      'You can set your company logo, brand colors (primary and secondary), the assistant\'s greeting message, ' +
      'and company name. All branding changes are applied live to the embedded chat widget on your website.',
  },
  {
    keywords: ['integration', 'integrations', 'what is an integration', 'connect crm', 'calendar sync'],
    title: 'Integrations',
    definition:
      'Integrations connect Zeeder to your existing business tools — CRM systems (HubSpot, Salesforce), ' +
      'calendar apps (Google Calendar, Outlook), SMS/WhatsApp, and custom knowledge bases. Integrations ' +
      'let your AI assistant book appointments, qualify leads, and access company-specific information.',
  },
  {
    keywords: ['widget body', 'widget', 'chat widget', 'embedded widget', 'what is a widget', 'web widget'],
    title: 'Chat Widget',
    definition:
      'The Chat Widget is the customer-facing interface embedded on your website or app. It\'s where ' +
      'your customers talk to your AI assistant. The widget displays your branding, uses your configured ' +
      'persona, and captures booking intents, leads, and feedback.',
  },
  {
    keywords: ['telemetry', 'metrics', 'analytics', 'dashboard', 'what is telemetry', 'track metrics'],
    title: 'Telemetry Dashboard',
    definition:
      'The Telemetry Dashboard shows real-time engagement data: conversation volume, signal sentiment, ' +
      'booking capture rate, top conversation topics, and customer satisfaction trends. Use it to monitor ' +
      'AI assistant performance and spot customer pain points.',
  },
  {
    keywords: ['knowledge base', 'rag', 'custom rag', 'vector', 'pdf', 'what is a knowledge base'],
    title: 'Custom Knowledge Base (RAG)',
    definition:
      'The Custom Knowledge Base is a vector store where you upload PDFs, manuals, FAQs, and policies. ' +
      'Your AI assistant automatically retrieves relevant content to answer customer questions. This ' +
      'powers product-specific, context-aware responses without needing to re-train the AI.',
  },
  {
    keywords: ['studio', 'branding studio', 'config studio', 'dashboard', 'configuration'],
    title: 'Branding Studio',
    definition:
      'The Branding Studio is your configuration center in Zeeder. Here you set your company logo, ' +
      'brand colors, assistant persona (name, voice, greeting), system instructions, and integrations. ' +
      'All changes are applied live to your customer-facing widget.',
  },
  {
    keywords: ['feature', 'features', 'capability', 'capabilities', 'what can i do', 'what can you do'],
    title: 'Platform Features',
    definition:
      'Zeeder\'s core features include AI assistant configuration (persona + branding), real-time ' +
      'engagement signals (sentiment, topics, intent), booking capture, CRM lead sync, custom knowledge-base ' +
      'training, telemetry dashboards, and multi-channel messaging (WhatsApp, SMS). Use the "Help" or ' +
      '"List Capabilities" voice commands to see available actions in your portal.',
  },
];

/**
 * Topic bypass guard: queries asking about business-specific topics should
 * bypass static definitions and route to Knowledge Base (RAG) for accurate,
 * tenant-specific information.
 *
 * Matches: "products", "services", "pricing", "plans", "features", "specs",
 *          "cost", "buy", "support", "contact"
 */
const TOPIC_BYPASS_REGEX = /\b(products?|services?|pricing|plans?|features?|specs?|cost|buy|support|contact)\b/i;

/**
 * Lookup a definition by query text. Returns the best-matching definition
 * entry or null if no match found. Matching is case-insensitive, strips
 * trailing punctuation, and prioritizes longer, more specific keywords to
 * avoid false positives (e.g., "widget body" matches before just "widget").
 *
 * **Topic Bypass:** Queries mentioning business topics (products, pricing,
 * services, etc.) return null to bypass Tier 1 definitions and route to
 * Knowledge Base (RAG) retrieval for tenant-specific information.
 *
 * @param queryText - The user's natural-language definition query
 * @returns The matching DefinitionEntry or null
 */
export function lookupDefinition(queryText: string): DefinitionEntry | null {
  // ─── Topic Bypass Guard ─────────────────────────────────────────────────
  // If the query mentions business topics, bypass static definitions to allow
  // Knowledge Base (RAG) retrieval with tenant-specific information.
  if (TOPIC_BYPASS_REGEX.test(queryText)) {
    return null;
  }

  // Normalize: lowercase, strip punctuation, trim whitespace
  const normalized = queryText
    .toLowerCase()
    .trim()
    .replace(/[?!.,;:]+$/, ''); // Strip trailing punctuation

  let bestMatch: DefinitionEntry | null = null;
  let bestKeywordLength = 0;

  for (const entry of PLATFORM_DEFINITIONS) {
    for (const keyword of entry.keywords) {
      // Match if keyword appears as a substring and is longer than any previous match
      if (normalized.includes(keyword) && keyword.length > bestKeywordLength) {
        bestMatch = entry;
        bestKeywordLength = keyword.length;
      }
    }
  }

  return bestMatch;
}

/**
 * Build a response summary for a matched definition. Formats the definition
 * into a conversational, TTS-friendly reply that fits in a voice response.
 *
 * @param entry - The matched DefinitionEntry
 * @returns A formatted response string ready for TTS
 */
export function buildDefinitionResponse(entry: DefinitionEntry): string {
  return entry.definition;
}
