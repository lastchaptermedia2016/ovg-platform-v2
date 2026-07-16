import { z } from 'zod';

// ────────────────────────────────────────────────────────────────────
// LLM Tool Definitions — Client Integrations
// ────────────────────────────────────────────────────────────────────
// These describe the functions the ZEEDER client AI concierge may invoke
// when the corresponding integration is active & configured for the tenant.
// They are intentionally framework-agnostic (plain objects) so they can be
// rendered into the system prompt as a structured "available functions"
// contract OR mapped onto native Groq tool-calling later without rewrites.

export interface ToolParameter {
  type: 'string' | 'number' | 'boolean';
  description: string;
  enum?: readonly string[];
}

export interface ToolDefinition {
  /** Stable function name the LLM emits. */
  name: string;
  /** Human-readable description of when to use it. */
  description: string;
  /** Parameter schema (injection-safe, typed). */
  parameters: Record<string, ToolParameter>;
  /** Integration id that must be active & configured for this to be exposed. */
  integrationId: string;
}

// ── Smart Booking ────────────────────────────────────────────────────
export const bookAppointmentTool: ToolDefinition = {
  name: 'book_appointment',
  description:
    'Schedule an appointment for the client using the connected calendar integration. Use when the user wants to book, reserve, or set an appointment.',
  integrationId: 'smart-booking',
  parameters: {
    date: {
      type: 'string',
      description: 'The requested date for the appointment (natural language or ISO date, e.g. "Tuesday" or "2026-07-21").',
    },
    time: {
      type: 'string',
      description: 'The requested time for the appointment (e.g. "3 PM", "15:00").',
    },
    email: {
      type: 'string',
      description: "The client's email address for the booking confirmation.",
    },
    name: {
      type: 'string',
      description: "The client's full name for the booking.",
    },
  },
};

// ── Live Inventory ───────────────────────────────────────────────────
export const searchCatalogTool: ToolDefinition = {
  name: 'search_catalog',
  description:
    'Look up live product, stock, or pricing information from the connected inventory integration. Use when the user asks about availability, products, or prices.',
  integrationId: 'live-inventory',
  parameters: {
    query: {
      type: 'string',
      description: 'The search query describing the product or item the client is asking about.',
    },
  },
};

// ── CRM Lead Sync ────────────────────────────────────────────────────
export const captureCrmLeadTool: ToolDefinition = {
  name: 'capture_crm_lead',
  description:
    'Record a qualified lead into the connected CRM (HubSpot, Salesforce, etc.). Use when the user provides a prospect name, email, or asks to save a lead.',
  integrationId: 'crm-sync',
  parameters: {
    name: {
      type: 'string',
      description: "The lead's full name.",
    },
    email: {
      type: 'string',
      description: "The lead's email address.",
    },
    notes: {
      type: 'string',
      description: 'Optional context or notes about the lead and their interest.',
    },
  },
};

export const INTEGRATION_TOOLS: ToolDefinition[] = [
  bookAppointmentTool,
  searchCatalogTool,
  captureCrmLeadTool,
];

export const INTEGRATION_TOOL_BY_NAME: Record<string, ToolDefinition> =
  Object.fromEntries(INTEGRATION_TOOLS.map((t) => [t.name, t]));

// ── Zod validation for an inbound function call emitted by the LLM ─────
// Keeps the dispatcher strict: a malformed tool call degrades to CLIENT_NOP
// instead of throwing and breaking the command pipeline.
export const FunctionCallSchema = z.object({
  name: z.string(),
  arguments: z.record(z.unknown()).default({}),
});

export type FunctionCall = z.infer<typeof FunctionCallSchema>;

/**
 * Decide which tools to expose for a tenant, given its saved integrations.
 * A tool is exposed only when its integration is present AND active/configured
 * (a configured secret, an enabled flag, or any populated integration field).
 */
export function resolveActiveTools(
  integrations: Record<string, Record<string, unknown>> | null | undefined
): ToolDefinition[] {
  if (!integrations) return [];
  return INTEGRATION_TOOLS.filter((tool) => {
    const cfg = integrations[tool.integrationId] as Record<string, unknown> | undefined;
    if (!cfg) return false;
    const enabled = cfg.enabled === true;
    const hasConfig =
      Boolean(cfg.calendarLink || cfg.inventoryApi || cfg.crmProvider || cfg.messagingChannel) ||
      Boolean(cfg.crmApiKey && (cfg.crmApiKey as { isConfigured?: boolean }).isConfigured) ||
      Boolean(cfg.twilioAuthToken && (cfg.twilioAuthToken as { isConfigured?: boolean }).isConfigured);
    return enabled || hasConfig;
  });
}
