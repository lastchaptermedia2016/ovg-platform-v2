/**
 * @file action-registry.ts
 *
 * ZEEDER Action Registry
 *
 * This file serves as the dictionary for all actionable voice commands
 * that the ZEEDER system can execute. Each entry maps a unique action
 * identifier to a handler function and metadata.
 *
 * Handlers receive an auto-injected `_clientProfile` key in the payload
 * (when available) so they can personalise responses — for example,
 * inserting the client's name into a greeting or TTS confirmation.
 *
 * @remarks
 * This module is intentionally **zero-dependency** with respect to the
 * reseller domain. It does not import from `@/hooks`, `@/contexts/HannahContext`,
 * or any reseller-scoped utilities.
 */

// ──────────────────────────── Type Definitions ───────────────────────────

/**
 * Union of all registered ZEEDER action IDs.
 * Add new action IDs here as the registry grows.
 */
export type ZeederActionId =
  | 'updateBranding'
  | 'ai_update_branding'
  | 'ai_update_persona'
  | 'ai_manage_memory'
  | 'ai_publish_studio_draft'
  | 'toggleAgent'
  | 'fetchTelemetry'
  | 'navigate';

/**
 * The shape returned by every ZEEDER action handler.
 */
export interface ZeederActionResult {
  /** Whether the action completed without a recoverable error. */
  success: boolean;
  /** Optional data payload returned by the handler. */
  data?: unknown;
  /** Human-readable error message if `success` is false. */
  error?: string;
  /**
   * If `true`, the action requires additional user input before it can
   * be considered complete. The ZEEDER state machine will transition
   * to `awaiting_input` mode.
   */
  awaitingInput?: boolean;
  /**
   * Optional TTS-ready greeting or confirmation text that can be spoken
   * back to the user. When present, the UI layer may read this aloud.
   */
  greeting?: string;
}

/**
 * Metadata and handler for a single registered ZEEDER action.
 */
export interface ZeederActionEntry {
  /** Unique identifier (matches the Map key). */
  id: ZeederActionId;
  /** Human-readable description for debugging / UI tooltips. */
  description: string;
  /**
   * The async handler that executes the action.
   *
   * @param payload - Arbitrary key-value data forwarded from the dispatcher.
   *   When a `clientProfile` is available, the context auto-injects
   *   `_clientProfile: { name, lastLogin? }` into the payload.
   */
  handler: (payload: Record<string, unknown>) => Promise<ZeederActionResult>;
}

// ──────────────────────────── Helpers ────────────────────────────────────

/**
 * Extract the client name from the auto-injected `_clientProfile` key,
 * falling back to a generic label.
 *
 * @param payload - The dispatch payload (may contain `_clientProfile`).
 * @returns The client's display name or "there" for a generic greeting.
 */
function getClientName(payload: Record<string, unknown>): string {
  const profile = payload._clientProfile as
    | { name?: string; lastLogin?: string }
    | undefined;
  return profile?.name ?? 'there';
}

// ──────────────────────────── Registry Map ───────────────────────────────

/**
 * The central registry of ZEEDER actions.
 *
 * @example
 * ```typescript
 * const entry = zeederActionRegistry.get('updateBranding');
 * if (entry) {
 *   const result = await entry.handler({ colors: { primary: '#00ffcc' } });
 * }
 * ```
 */
export const zeederActionRegistry = new Map<ZeederActionId, ZeederActionEntry>([
  [
    'updateBranding',
    {
      id: 'updateBranding',
      description: 'Update the client branding configuration (colors, logo, etc.).',
      handler: async (payload: Record<string, unknown>): Promise<ZeederActionResult> => {
        const clientName = getClientName(payload);

        // ── Guard: reject empty or semantically empty payloads early ──
        const knownBrandingKeys = [
          'branding',
          'colors',
          'primaryColor',
          'accentColor',
          'logoUrl',
          'logo',
          'font',
          'style',
          'theme',
          'header',
          'footer',
          'widgetBody',
        ] as const;

        const hasBrandingSignal = knownBrandingKeys.some((key) => {
          const value = payload[key];
          return value !== undefined && value !== null && value !== '';
        });

        if (!hasBrandingSignal) {
          return {
            success: true,
            awaitingInput: true,
            greeting: `Sure, ${clientName}! Which branding property would you like to update — colors, logo, or style?`,
          };
        }

        // ── Wire to real BrandingStudio logic via update-studio-config API ──
        const { resolveTenantId } = await import('@/lib/resolveTenantId');
        const { translateVoicePayloadToStudioConfig } = await import('@/lib/translateVoicePayloadToStudioConfig');

        // Get current user from browser-safe supabase client
        const supabase = await (await import('@/lib/supabase/client')).createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user?.id) {
          return {
            success: false,
            error: 'Unable to resolve current user session.',
          };
        }

        const tenantResult = await resolveTenantId(user.id);
        if (tenantResult.error || !tenantResult.data) {
          return {
            success: false,
            error: tenantResult.error?.message ?? 'Failed to resolve tenant ID.',
          };
        }

        const tenantId = tenantResult.data;
        let studioConfig: Record<string, unknown>;

        if (payload.branding && typeof payload.branding === 'object') {
          studioConfig = { branding: payload.branding };
        } else {
          studioConfig = translateVoicePayloadToStudioConfig(payload).studioConfig;
        }

        if (Object.keys(studioConfig).length === 0) {
          return {
            success: true,
            awaitingInput: true,
            greeting: `Sure, ${clientName}! Tell me the colors, logo, or style you'd like, or open the Branding Studio to set it up.`,
          };
        }

        try {
          const response = await fetch('/api/client/update-studio-config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tenantId, studioConfig, source: 'hannah' }),
          });

          const result = await response.json();

          if (!response.ok) {
            return {
              success: false,
              error: result.error ?? 'Failed to update branding configuration.',
            };
          }

          try {
            const { emitBrandingSync } = await import('@/lib/ai/tools/client-tool-executors');
            emitBrandingSync(tenantId, studioConfig);
          } catch {
            // Non-fatal — postgres_changes listener will catch up
          }

          return {
            success: true,
            data: { applied: result.success },
            greeting: `Branding updated for ${clientName}.`,
          };
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Network error during branding update.';
          return {
            success: false,
            error: msg,
          };
        }
      },
    },
  ],
  [
    'ai_update_branding',
    {
      id: 'ai_update_branding',
      description: 'Update widget branding via structured AI tool (mirrors BrandingStudio save).',
      handler: async (_payload: Record<string, unknown>): Promise<ZeederActionResult> => {
        try {
          const { executeAiUpdateBranding } = await import('@/lib/ai/tools/client-tool-executors');
          const result = await executeAiUpdateBranding({
            primaryColor: _payload.primaryColor as string | undefined,
            accentColor: _payload.accentColor as string | undefined,
            brandName: _payload.brandName as string | undefined,
            widgetPosition: _payload.widgetPosition as 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left' | undefined,
            mode: _payload.mode as 'sales' | 'concierge' | undefined,
          });
          return {
            success: result.success,
            greeting: result.message,
            data: result.data,
            error: result.error,
          };
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Failed to update branding via voice tool.';
          return { success: false, error: msg };
        }
      },
    },
  ],
  [
    'ai_update_persona',
    {
      id: 'ai_update_persona',
      description: 'Update AI persona configuration via structured AI tool (mirrors Persona page save).',
      handler: async (_payload: Record<string, unknown>): Promise<ZeederActionResult> => {
        try {
          const { executeAiUpdatePersona } = await import('@/lib/ai/tools/client-tool-executors');
          const result = await executeAiUpdatePersona({
            assistantName: _payload.assistantName as string | undefined,
            greetingMessage: _payload.greetingMessage as string | undefined,
            voiceId: _payload.voiceId as string | undefined,
            systemInstructions: _payload.systemInstructions as string | undefined,
          });
          return {
            success: result.success,
            greeting: result.message,
            data: result.data,
            error: result.error,
          };
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Failed to update persona via voice tool.';
          return { success: false, error: msg };
        }
      },
    },
  ],
  [
    'ai_manage_memory',
    {
      id: 'ai_manage_memory',
      description: 'Manage knowledge-base memory entries via structured AI tool (create, delete, search).',
      handler: async (_payload: Record<string, unknown>): Promise<ZeederActionResult> => {
        try {
          const { executeAiManageMemory } = await import('@/lib/ai/tools/client-tool-executors');
          const result = await executeAiManageMemory({
            action: (_payload.action as 'create' | 'delete' | 'search' | undefined) ?? 'search',
            content: _payload.content as string | undefined,
            memoryId: _payload.memoryId as string | undefined,
            category: _payload.category as string | undefined,
          });
          return {
            success: result.success,
            greeting: result.message,
            data: result.data,
            error: result.error,
          };
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Failed to manage memory via voice tool.';
          return { success: false, error: msg };
        }
      },
    },
  ],
  [
    'ai_publish_studio_draft',
    {
      id: 'ai_publish_studio_draft',
      description: 'Commit the current studio draft to the live tenant configuration.',
      handler: async (_payload: Record<string, unknown>): Promise<ZeederActionResult> => {
        try {
          const { executeAiPublishStudioDraft } = await import('@/lib/ai/tools/client-tool-executors');
          const result = await executeAiPublishStudioDraft({
            confirm: (_payload.confirm as boolean | undefined) ?? false,
          });
          return {
            success: result.success,
            greeting: result.message,
            data: result.data,
            error: result.error,
          };
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Failed to publish studio draft via voice tool.';
          return { success: false, error: msg };
        }
      },
    },
  ],
  [
    'toggleAgent',
    {
      id: 'toggleAgent',
      description: 'Enable or disable a specific AI agent by ID.',
      handler: async (payload: Record<string, unknown>): Promise<ZeederActionResult> => {
        const clientName = getClientName(payload);
        const agentId = payload.agentId;
        if (typeof agentId !== 'string' || agentId.length === 0) {
          return {
            success: false,
            error: 'toggleAgent requires a non-empty string `agentId` in the payload.',
          };
        }

        // ── Placeholder — wire to real agent lifecycle logic when available ──
        const enabled = Boolean(payload.enabled);
        const stateLabel = enabled ? 'enabled' : 'disabled';
        console.log(`[ZEEDER:toggleAgent] Agent "${agentId}" → ${stateLabel}`);

        return {
          success: true,
          data: { agentId, enabled },
          greeting: `${clientName}, agent "${agentId}" is now ${stateLabel}.`,
        };
      },
    },
  ],
  [
    'fetchTelemetry',
    {
      id: 'fetchTelemetry',
      description: 'Fetch real-time telemetry data for a given metric and time range.',
      handler: async (payload: Record<string, unknown>): Promise<ZeederActionResult> => {
        const clientName = getClientName(payload);
        const metric = payload.metric;
        if (typeof metric !== 'string' || metric.length === 0) {
          return {
            success: true,
            awaitingInput: true,
            greeting: `${clientName}, which metric would you like — performance, health, or status?`,
          };
        }

        // ── Placeholder — wire to real telemetry pipeline when available ──
        const mockData = {
          metric,
          value: Math.round(Math.random() * 1000),
          unit: 'ms',
          range: payload.range ?? '1h',
          fetchedAt: new Date().toISOString(),
        };

        console.log('[ZEEDER:fetchTelemetry] Returning mock data:', mockData);

        return {
          success: true,
          data: mockData,
          greeting: `${clientName}, here are your ${metric} metrics.`,
        };
      },
    },
  ],
  [
    'navigate',
    {
      id: 'navigate',
      description: 'Navigate to a specific tab or page in the client dashboard.',
      handler: async (payload: Record<string, unknown>): Promise<ZeederActionResult> => {
        const allowedTabs = ['branding', 'persona', 'knowledge', 'integrations', 'analytics'] as const;
        const rawTab = payload.targetTab ?? payload.tab;
        const tab = typeof rawTab === 'string' && allowedTabs.includes(rawTab as typeof allowedTabs[number])
          ? (rawTab as typeof allowedTabs[number])
          : undefined;
        const href = payload.href as string | undefined;
        const targetPath = href ?? (tab ? `/client/dashboard/studio/${tab}` : '/client/dashboard/studio/branding');

        // Client-side navigation using browser location.
        if (typeof window !== 'undefined') {
          window.location.href = targetPath;
        }

        console.log(`[ZEEDER:navigate] Navigating to ${targetPath}`);

        return {
          success: true,
          data: { targetPath, tab, href },
          greeting: `Navigating to ${targetPath}.`,
        };
      },
    },
  ],
]);

/**
 * Convenience helper: check whether a given string is a registered action ID.
 *
 * @param id - The string to check.
 * @returns `true` if the ID exists in the registry.
 */
export function isZeederActionId(id: string): id is ZeederActionId {
  return zeederActionRegistry.has(id as ZeederActionId);
}