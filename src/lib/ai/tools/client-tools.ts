/**
 * @file client-tools.ts
 *
 * Structured tool schemas for client-surface AI voice actions.
 * These define the canonical parameter contracts for the 4 voice-action
 * parity tools that mirror human UI mutations in the /client portal.
 *
 * Each schema is consumed by:
 *  1. The ZEEDER action-registry handlers (validation before dispatch)
 *  2. The process-command route (action type whitelisting via allowedActions)
 *  3. The system prompt builder (documenting available tools to the LLM)
 *
 * @remarks
 * Client-safe: no server-only imports. Uses only Zod for schema definitions.
 */

import { z } from 'zod';

// ──────────────────────────── Branding ────────────────────────────────────

/**
 * Voice-driven branding update. Mirrors the manual controls in the
 * BrandingStudio (primaryColor, accentColor, brandName, widgetPosition, mode).
 *
 * `mode` maps to the persona mode toggle on the Persona page — it rides the
 * branding channel so a single voice command ("set my theme to concierge mode")
 * updates both visual branding context and AI persona mode coherently.
 */
export const AiUpdateBrandingSchema = z.object({
  primaryColor: z.string().optional(),
  accentColor: z.string().optional(),
  brandName: z.string().optional(),
  widgetPosition: z.enum(['bottom-right', 'bottom-left', 'top-right', 'top-left']).optional(),
  mode: z.enum(['sales', 'concierge']).optional(),
});

export type AiUpdateBrandingParams = z.infer<typeof AiUpdateBrandingSchema>;

// ──────────────────────────── Persona ─────────────────────────────────────

/**
 * Voice-driven AI persona configuration update.
 *
 * `assistantName` maps to `widget_config.branding.brandName` (the name the
 * AI concierge represents to visitors).
 * `greetingMessage` maps to `widget_config.greeting`.
 * `voiceId` maps to `widget_config.ai_settings.voiceId`.
 * `systemInstructions` maps to `widget_config.aiPersona.systemPrompt`.
 */
export const AiUpdatePersonaSchema = z.object({
  assistantName: z.string().min(1, 'Assistant name cannot be empty').optional(),
  greetingMessage: z.string().min(1, 'Greeting message cannot be empty').optional(),
  voiceId: z.string().optional(),
  systemInstructions: z.string().min(1, 'System instructions cannot be empty').optional(),
});

export type AiUpdatePersonaParams = z.infer<typeof AiUpdatePersonaSchema>;

// ──────────────────────────── Memory ────────────────────────────────────────

/**
 * Voice-driven memory / knowledge management.
 *
 * - `create`: Adds a new knowledge-base entry (title + content) to the
 *   tenant's `tenant_knowledge` table. The `content` field carries the
 *   factual memory (e.g., "we are closed on Sundays").
 * - `delete`: Removes a knowledge entry by `memoryId` (UUID). If no
 *   `memoryId` is provided, performs a fuzzy title match against existing
 *   entries and returns a TTS clarification prompt if ambiguous.
 * - `search`: Queries `client_memories` + `tenant_knowledge` for matching
 *   content; returns a natural-language summary (never raw DB rows).
 */
export const AiManageMemorySchema = z.object({
  action: z.enum(['create', 'delete', 'search']),
  content: z.string().optional(),
  memoryId: z.string().uuid('Invalid memory ID').optional(),
  category: z.string().optional(),
});

export type AiManageMemoryParams = z.infer<typeof AiManageMemorySchema>;

export interface MemoryEntry {
  id: string;
  title: string;
  content: string;
  category: string | null;
}

export interface MemoryOperationResult {
  message: string;
  entries?: MemoryEntry[];
  ambiguous?: boolean;
  candidates?: { id: string; title: string }[];
}

// ──────────────────────────── Draft Publish ───────────────────────────────

/**
 * Voice-driven studio draft publish.
 *
 * The `confirm: true` flag is a safeguard against accidental verbal stumbles.
 * If `confirm` is false or absent, the tool returns a TTS clarification
 * prompt ("You said 'publish my changes' — say 'yes, publish' to confirm")
 * rather than committing the draft.
 */
export const AiPublishDraftSchema = z.object({
  confirm: z.boolean(),
});

export type AiPublishDraftParams = z.infer<typeof AiPublishDraftSchema>;

// ──────────────────────────── Tool Registry ─────────────────────────────────

export type ClientToolName =
  | 'ai_update_branding'
  | 'ai_update_persona'
  | 'ai_manage_memory'
  | 'ai_publish_studio_draft';

export interface ClientToolDefinition {
  name: ClientToolName;
  description: string;
  parameters: Record<string, unknown>;
}

/**
 * Registry of client-surface voice tools, keyed by name.
 * Each entry mirrors the Zod schema above and is referenced by the
 * process-command route's system prompt generation.
 */
export const CLIENT_TOOLS: Record<ClientToolName, ClientToolDefinition> = {
  ai_update_branding: {
    name: 'ai_update_branding',
    description:
      'Update the widget branding configuration including primary color, accent color, brand name, widget position, or AI persona mode.',
    parameters: {
      primaryColor: { type: 'string', description: 'Primary brand color as a hex code (e.g. "#0097b2")' },
      accentColor: { type: 'string', description: 'Accent color for footer/secondary elements as a hex code' },
      brandName: { type: 'string', description: 'The business name displayed in the widget' },
      widgetPosition: { type: 'string', enum: ['bottom-right', 'bottom-left', 'top-right', 'top-left'], description: 'Widget placement corner' },
      mode: { type: 'string', enum: ['sales', 'concierge'], description: 'AI persona mode to switch to' },
    },
  },
  ai_update_persona: {
    name: 'ai_update_persona',
    description:
      'Update the AI assistant persona: assistant name, greeting message, voice selection, or system instructions.',
    parameters: {
      assistantName: { type: 'string', description: 'The name the AI assistant uses to identify itself' },
      greetingMessage: { type: 'string', description: 'The initial greeting shown when a visitor opens the chat' },
      voiceId: { type: 'string', description: 'The TTS voice identifier (e.g. "hannah", "classic_male")' },
      systemInstructions: { type: 'string', description: 'The system prompt that defines AI behavior and tone' },
    },
  },
  ai_manage_memory: {
    name: 'ai_manage_memory',
    description:
      'Create, delete, or search knowledge-base memory entries for the active tenant. Useful for recording business hours, policies, or answering factual questions about the business.',
    parameters: {
      action: { type: 'string', enum: ['create', 'delete', 'search'], description: 'The memory operation to perform' },
      content: { type: 'string', description: 'The memory content (required for create, used for fuzzy search on delete)' },
      memoryId: { type: 'string', description: 'UUID of the knowledge entry (required for delete by ID)' },
      category: { type: 'string', description: 'Optional category label for the knowledge entry' },
    },
  },
  ai_publish_studio_draft: {
    name: 'ai_publish_studio_draft',
    description:
      'Commit the current unsaved studio draft (branding + persona) to the live tenant configuration. Requires explicit confirmation to prevent accidental publishes.',
    parameters: {
      confirm: { type: 'boolean', description: 'Must be true to proceed — safety guard against accidental verbal commands' },
    },
  },
};

export const CLIENT_TOOL_BY_NAME: Record<string, ClientToolDefinition> =
  Object.fromEntries(
    Object.entries(CLIENT_TOOLS).map(([name, def]) => [
      name,
      def,
    ]),
  );
