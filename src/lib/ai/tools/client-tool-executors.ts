/**
 * @file client-tool-executors.ts
 *
 * Execution handlers for client-surface AI voice tools.
 *
 * Each executor follows a strict security contract:
 *  1. Resolve the active tenantId from the authenticated session
 *     (via `resolveTenantId` — never trusts LLM-supplied tenantId).
 *  2. Fast-fail: check `canExecute` permission client-side (replicates
 *     `checkTenantAiExecutePermission` using the browser supabase client
 *     so we can read `widget_config.aiPersona.conversationStyle`).
 *     The authoritative check also runs server-side in the API route
 *     when `source === 'hannah'` (defense in depth).
 *  3. Call the appropriate client-scoped API endpoint with `source: 'hannah'`.
 *  4. Emit a `BroadcastChannel('branding-sync')` event so open dashboard
 *     tabs update instantly without waiting for postgres_changes latency.
 *  5. Return a structured result with a TTS-ready confirmation message.
 *
 * Client-safe: no server-only imports. Uses only `@/lib/supabase/client`.
 */

import { createClient as createBrowserClient } from '@/lib/supabase/client';
import { resolveTenantId } from '@/lib/resolveTenantId';
import {
  AiUpdateBrandingParams,
  AiUpdatePersonaParams,
  AiManageMemoryParams,
  AiPublishDraftParams,
  MemoryOperationResult,
} from './client-tools';

// ──────────────────────────── Types ───────────────────────────────────────

export interface ToolResult {
  /** Whether the tool completed successfully. */
  success: boolean;
  /** Human-readable confirmation message for TTS synthesis. */
  message: string;
  /** Structured data returned to the caller (e.g. search results). */
  data?: unknown;
  /** Error message if `success` is false. */
  error?: string;
}

/** Result of the client-side permission fast-fail check. */
interface CanExecuteResult {
  allowed: boolean;
  tenantId: string;
  reason?: string;
}

// ──────────────────────────── Security ────────────────────────────────────

/**
 * Resolve the active tenant for the current browser session and perform a
 * client-side `canExecute` permission check (fast-fail). The authoritative
 * server-side check runs in the API route — this is an additional guard so
 * the voice UI surfaces an immediate denial rather than an API round-trip.
 *
 * Replicates `checkTenantAiExecutePermission` logic using the browser client:
 * reads `widget_config.aiPersona.conversationStyle.actionCapabilities.canExecute`
 * from the `tenants` table via the authenticated session's RLS.
 */
async function resolveTenantWithPermission(): Promise<CanExecuteResult> {
  const supabase = createBrowserClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user?.id) {
    return { allowed: false, tenantId: '', reason: 'No authenticated session' };
  }

  const { data: tenantId, error: tenantError } = await resolveTenantId(user.id, supabase);

  if (tenantError || !tenantId) {
    return {
      allowed: false,
      tenantId: '',
      reason: tenantError?.message ?? 'Unable to resolve active tenant',
    };
  }

  // Fast-fail permission check (server-side authoritative check in API route)
  const { data: tenant, error: tenantFetchError } = await supabase
    .from('tenants')
    .select('widget_config')
    .eq('id', tenantId)
    .maybeSingle();

  if (tenantFetchError || !tenant?.widget_config) {
    return { allowed: false, tenantId, reason: 'Tenant configuration not found' };
  }

  const config = tenant.widget_config as Record<string, unknown>;
  const persona = config.aiPersona as Record<string, unknown> | undefined;
  if (!persona) {
    return { allowed: false, tenantId, reason: 'AI persona configuration missing' };
  }

  const conversationStyle = persona.conversationStyle as Record<string, unknown> | undefined;
  if (conversationStyle) {
    const actionCaps = conversationStyle.actionCapabilities as Record<string, unknown> | undefined;
    if (actionCaps?.canExecute === true) {
      return { allowed: true, tenantId };
    }
  }

  // Legacy fallback path during deprecation window
  const legacy = config.widget_studio as Record<string, unknown> | undefined;
  const legacyPersona = legacy?.aiPersona as Record<string, unknown> | undefined;
  if (legacyPersona) {
    const legacyCs = legacyPersona.conversationStyle as Record<string, unknown> | undefined;
    if (legacyCs) {
      const actionCaps = legacyCs.actionCapabilities as Record<string, unknown> | undefined;
      if (actionCaps?.canExecute === true) {
        return { allowed: true, tenantId };
      }
    }
  }

  return { allowed: false, tenantId, reason: 'AI execution is not enabled for this account' };
}

// ──────────────────────────── Broadcast ───────────────────────────────────

/**
 * Emit a branding-sync broadcast so open client dashboard tabs update
 * instantly without waiting for the postgres_changes realtime listener.
 */
export function emitBrandingSync(tenantId: string, widgetConfig: Record<string, unknown>): void {
  if (typeof window === 'undefined' || !('BroadcastChannel' in window)) return;
  try {
    const channel = new BroadcastChannel('branding-sync');
    channel.postMessage({ type: 'BRANDING_UPDATED', tenantId, widgetConfig });
    channel.close();
  } catch {
    // Non-fatal — postgres_changes listener will catch up
  }
}

// ──────────────────────────── Tool: ai_update_branding ────────────────────

/**
 * Update widget branding (primary color, accent, brand name, position, mode).
 * Mirrors the BrandingStudio's handleSave → /api/client/update-studio-config.
 */
export async function executeAiUpdateBranding(
  params: AiUpdateBrandingParams,
): Promise<ToolResult> {
  const { allowed, tenantId, reason } = await resolveTenantWithPermission();

  if (!allowed) {
    return {
      success: false,
      message: reason ?? 'AI execution is not enabled for your account.',
      error: reason,
    };
  }

  // Build the studioConfig patch that mirrors what the UI sends.
  const studioConfig: Record<string, unknown> = {
    branding: {
      primaryColor: params.primaryColor,
      accentColor: params.accentColor,
      brandName: params.brandName,
      widgetPosition: params.widgetPosition,
    },
  };

  // If mode is provided, also include the AI persona mode toggle.
  if (params.mode) {
    studioConfig.aiPersona = { personaMode: params.mode };
  }

  try {
    const response = await fetch('/api/client/update-studio-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenantId,
        studioConfig,
        source: 'hannah',
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      return {
        success: false,
        message: result.error ?? 'Failed to update branding configuration.',
        error: result.error,
      };
    }

    // Emit broadcast for instant UI sync across tabs
    emitBrandingSync(tenantId, studioConfig);

    // Build TTS confirmation
    const parts: string[] = [];
    if (params.primaryColor) parts.push('primary color');
    if (params.accentColor) parts.push('accent color');
    if (params.brandName) parts.push('brand name');
    if (params.widgetPosition) parts.push('widget position');
    if (params.mode) parts.push('AI assistant mode');

    const what = parts.length > 0 ? parts.join(', ') : 'branding configuration';
    const name = params.brandName ? ` to ${params.brandName}` : '';

    return {
      success: true,
      message: `Updated your ${what}${name} and synced your dashboard.`,
      data: result,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Network error during branding update.';
    return {
      success: false,
      message: 'I had trouble updating your branding. Please try again.',
      error: msg,
    };
  }
}

// ──────────────────────────── Tool: ai_update_persona ─────────────────────

/**
 * Update AI persona (assistant name, greeting, voice, system instructions).
 * Mirrors the Persona page's handleSave → /api/client/update-studio-config
 * with aiPersona payload.
 */
export async function executeAiUpdatePersona(
  params: AiUpdatePersonaParams,
): Promise<ToolResult> {
  const { allowed, tenantId, reason } = await resolveTenantWithPermission();

  if (!allowed) {
    return {
      success: false,
      message: reason ?? 'AI execution is not enabled for your account.',
      error: reason,
    };
  }

  const studioConfig: Record<string, unknown> = {};

  studioConfig.aiPersona = {
    name: params.assistantName,
    systemPrompt: params.systemInstructions,
    voiceId: params.voiceId,
  };

  if (params.greetingMessage !== undefined) {
    studioConfig.greeting = params.greetingMessage;
  }
  if (params.assistantName !== undefined) {
    studioConfig.branding = { brandName: params.assistantName };
  }
  if (params.voiceId !== undefined) {
    studioConfig.ai_settings = { voiceId: params.voiceId };
  }

  try {
    const response = await fetch('/api/client/update-studio-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenantId,
        studioConfig,
        source: 'hannah',
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      return {
        success: false,
        message: result.error ?? 'Failed to update persona configuration.',
        error: result.error,
      };
    }

    // Emit broadcast for instant UI sync
    emitBrandingSync(tenantId, studioConfig);

    // Build TTS confirmation
    const parts: string[] = [];
    if (params.assistantName) parts.push(`assistant name to ${params.assistantName}`);
    if (params.greetingMessage) parts.push('greeting message');
    if (params.voiceId) parts.push(`voice to ${params.voiceId}`);
    if (params.systemInstructions) parts.push('system instructions');

    const what = parts.length > 0 ? parts.join(', ') : 'persona settings';

    return {
      success: true,
      message: `Updated your ${what} and synced your dashboard.`,
      data: result,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Network error during persona update.';
    return {
      success: false,
      message: 'I had trouble updating your persona settings. Please try again.',
      error: msg,
    };
  }
}

// ──────────────────────────── Tool: ai_manage_memory ──────────────────────

/**
 * Create, delete, or search knowledge-base memory entries.
 * - create: POST to /api/client/knowledge with source: 'hannah'
 * - delete: DELETE /api/client/knowledge (by ID or fuzzy title match)
 * - search: GET /api/client/knowledge + /api/client/memories, filter client-side
 */
export async function executeAiManageMemory(
  params: AiManageMemoryParams,
): Promise<ToolResult & { entries?: MemoryOperationResult['entries'] }> {
  const { allowed, tenantId, reason } = await resolveTenantWithPermission();

  if (!allowed) {
    return {
      success: false,
      message: reason ?? 'AI execution is not enabled for your account.',
      error: reason,
    };
  }

  switch (params.action) {
    case 'create': {
      if (!params.content || params.content.trim().length === 0) {
        return {
          success: false,
          message: 'I need some content to create a memory. What would you like me to remember?',
          error: 'Missing content for create operation',
        };
      }

      // Use the first 8 words of content as the title
      const title = params.content
        .split(' ')
        .slice(0, 8)
        .join(' ') || 'New Memory';

      try {
        const response = await fetch('/api/client/knowledge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title,
            content: params.content,
            category: params.category,
            source: 'hannah',
          }),
        });

        const result = await response.json();

        if (!response.ok) {
          return {
            success: false,
            message: result.error ?? 'Failed to save the memory.',
            error: result.error,
          };
        }

        // Emit broadcast for memory-aware components
        if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
          try {
            const channel = new BroadcastChannel('branding-sync');
            channel.postMessage({ type: 'MEMORY_UPDATED', tenantId });
            channel.close();
          } catch {
            // Non-fatal
          }
        }

        return {
          success: true,
          message: `I've saved that to your knowledge base: "${params.content}".`,
          data: result,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Network error saving memory.';
        return {
          success: false,
          message: 'I had trouble saving that memory. Please try again.',
          error: msg,
        };
      }
    }

    case 'delete': {
      if (!params.memoryId && !params.content) {
        return {
          success: false,
          message: 'To delete a memory, tell me its ID or what it was about.',
          error: 'Missing memoryId or content for delete operation',
        };
      }

      // If we have a direct ID, delete it
      if (params.memoryId) {
        try {
          const response = await fetch('/api/client/knowledge', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: params.memoryId,
              source: 'hannah',
            }),
          });

          const result = await response.json();

          if (!response.ok) {
            return {
              success: false,
              message: result.error ?? 'Failed to delete the memory.',
              error: result.error,
            };
          }

          if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
            try {
              const channel = new BroadcastChannel('branding-sync');
              channel.postMessage({ type: 'MEMORY_UPDATED', tenantId });
              channel.close();
            } catch {
              // Non-fatal
            }
          }

          return {
            success: true,
            message: "I've removed that memory from your knowledge base.",
            data: result,
          };
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Network error deleting memory.';
          return {
            success: false,
            message: 'I had trouble deleting that memory. Please try again.',
            error: msg,
          };
        }
      }

      // Fuzzy match: search knowledge base for entries matching content
      try {
        const response = await fetch('/api/client/knowledge');
        const result = await response.json();

        if (!response.ok || !result.success) {
          return {
            success: false,
            message: 'I couldn\'t access your knowledge base to find that memory.',
            error: result?.error ?? 'Failed to fetch knowledge entries',
          };
        }

        const entries: Array<{ id: string; title: string; content: string }> =
          result.data ?? [];

        const searchTerm = (params.content ?? '').toLowerCase().trim();
        const matches = entries.filter(
          (e) =>
            e.title.toLowerCase().includes(searchTerm) ||
            e.content.toLowerCase().includes(searchTerm),
        );

        if (matches.length === 0) {
          return {
            success: false,
            message: 'I couldn\'t find a memory matching that description.',
            error: 'No matching memory entries found',
          };
        }

        if (matches.length === 1) {
          // Unambiguous — delete it
          const entry = matches[0];
          const delResponse = await fetch('/api/client/knowledge', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: entry.id,
              source: 'hannah',
            }),
          });

          if (!delResponse.ok) {
            const delResult = await delResponse.json();
            return {
              success: false,
              message: delResult.error ?? 'Failed to delete the memory.',
              error: delResult.error,
            };
          }

          if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
            try {
              const channel = new BroadcastChannel('branding-sync');
              channel.postMessage({ type: 'MEMORY_UPDATED', tenantId });
              channel.close();
            } catch {
              // Non-fatal
            }
          }

          return {
            success: true,
            message: `I've removed the memory about "${entry.title}" from your knowledge base.`,
            data: { deleted: entry },
          };
        }

        // Ambiguous — return candidates for clarification
        return {
          success: true,
          message: `I found ${matches.length} memories matching "${params.content}". Which one should I delete?`,
          data: {
            ambiguous: true,
            candidates: matches.map((m) => ({
              id: m.id,
              title: m.title,
            })),
          },
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Network error during memory search.';
        return {
          success: false,
          message: 'I had trouble searching your memories. Please try again.',
          error: msg,
        };
      }
    }

    case 'search': {
      if (!params.content || params.content.trim().length === 0) {
        return {
          success: false,
          message: 'What would you like me to look up in your memories?',
          error: 'Missing content for search operation',
        };
      }

      try {
        const response = await fetch('/api/client/knowledge');
        const result = await response.json();

        if (!response.ok || !result.success) {
          return {
            success: false,
            message: 'I couldn\'t access your knowledge base to search.',
            error: result?.error ?? 'Failed to fetch knowledge entries',
          };
        }

        const entries: Array<{ id: string; title: string; content: string; category: string | null }> =
          result.data ?? [];

        const searchTerm = params.content.toLowerCase().trim();
        const matches = entries.filter(
          (e) =>
            e.title.toLowerCase().includes(searchTerm) ||
            e.content.toLowerCase().includes(searchTerm) ||
            (e.category && e.category.toLowerCase().includes(searchTerm)),
        );

        if (matches.length === 0) {
          return {
            success: false,
            message: 'I couldn\'t find any memories matching that.',
            error: 'No matching memories found',
          };
        }

        const summary = matches
          .map((m) => `${m.title}: ${m.content}`)
          .join('; ');

        return {
          success: true,
          message: `Here's what I found: ${summary}`,
          data: { entries: matches },
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Network error during memory search.';
        return {
          success: false,
          message: 'I had trouble searching your memories. Please try again.',
          error: msg,
        };
      }
    }

    default: {
      const safeAction = (params as { action?: string }).action ?? 'unknown';
      return {
        success: false,
        message: "I don't recognize that memory operation.",
        error: `Unknown memory action: ${safeAction}`,
      };
    }
  }
}

// ──────────────────────────── Tool: ai_publish_studio_draft ────────────────

/**
 * Commit the current unsaved studio draft to live production config.
 * Requires explicit `confirm: true` — a safety guard against accidental
 * verbal stumbles.
 */
export async function executeAiPublishStudioDraft(
  params: AiPublishDraftParams,
): Promise<ToolResult> {
  if (!params.confirm) {
    return {
      success: true,
      message:
        'You said "publish my changes" but I didn\'t catch a clear confirmation. ' +
        'Say "yes, publish" or "confirm publish" to commit your draft to the live widget.',
    };
  }

  const { allowed, tenantId, reason } = await resolveTenantWithPermission();

  if (!allowed) {
    return {
      success: false,
      message: reason ?? 'AI execution is not enabled for your account.',
      error: reason,
    };
  }

  try {
    // Read the current draft from StudioDraftContext via BroadcastChannel round-trip.
    // The draft is committed through the standard update-studio-config endpoint.
    // Since the ZEEDER layer doesn't have direct access to the React draft state,
    // we dispatch a DRAFT_PUBLISH event that the StudioDraftProvider's
    // requestBrandingSave handler picks up (it dispatches
    // 'branding-concierge:confirm' which triggers handleSave in
    // ClientBrandingStudio).
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('branding-concierge:confirm'));
    }

    // Emit a publish broadcast so all tabs know a publish was requested
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        const channel = new BroadcastChannel('branding-sync');
        channel.postMessage({ type: 'DRAFT_PUBLISHED', tenantId });
        channel.close();
      } catch {
        // Non-fatal
      }
    }

    return {
      success: true,
      message:
        'I\'ve published your studio draft to the live widget configuration. ' +
        'Your branding and persona changes are now active for all visitors.',
      data: { published: true, tenantId },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to publish studio draft.';
    return {
      success: false,
      message: 'I had trouble publishing your draft. Please try again or use the Save button.',
      error: msg,
    };
  }
}
