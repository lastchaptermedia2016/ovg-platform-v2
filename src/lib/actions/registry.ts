/**
 * @file registry.ts
 *
 * ActionRegistry — the unified execution boundary between the AI (actionable /
 * conversational) layer and the data layer.
 *
 * Lifecycle for every dispatched action:
 *   1. Validate  — the payload is parsed against the relevant Zod schema.
 *   2. Authorize — AuthMiddleware.enforce() checks identity, tenant
 *                  ownership, and role policy.
 *   3. Commit    — on success, the injected DB commit function persists the
 *                  change (registry holds NO database logic of its own).
 *
 * Validation and authorization failures are returned as structured
 * `ActionError` objects (not thrown) so the Conversational AI can interpret
 * them and craft an end-user-facing response.
 *
 * The registry is decoupled from persistence: the commit function is supplied
 * at dispatch time (or via a default registered against the action), which
 * keeps the registry fully unit-testable in isolation.
 */

import { z, ZodError } from 'zod';
import {
  CanonicalWidgetConfigSchema,
  type CanonicalWidgetConfig,
} from '../schemas/tenant-config.canonical';
import { AuthMiddleware, type AuthContext, type AuthResult, type ActionPolicy } from './auth-middleware';

// ──────────────────────────────────────────────────────────────────────────────
// Structured error model
// ──────────────────────────────────────────────────────────────────────────────

export type ActionErrorCode =
  | 'VALIDATION_ERROR'
  | 'AUTH_ERROR'
  | 'COMMIT_ERROR'
  | 'UNKNOWN_ACTION'
  | 'EXECUTION_ERROR';

export interface ActionError {
  code: ActionErrorCode;
  message: string;
  /** Machine-readable details (e.g. Zod issue list) for debugging / audit. */
  details?: unknown;
}

/** Discriminated union return type for every dispatch. */
export type ActionOutcome<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: ActionError };

// ──────────────────────────────────────────────────────────────────────────────
// Action definitions
// ──────────────────────────────────────────────────────────────────────────────

/** Payload schemas the registry currently understands. */
export type PersonaMode = 'sales' | 'concierge';

export const PersonaModeSchema = z.enum(['sales', 'concierge']);

export type ActionPayloadMap = {
  UPDATE_WIDGET_CONFIG: CanonicalWidgetConfig;
  UPDATE_PERSONA: { mode: PersonaMode };
  APPLY_BRANDING_THEME: CanonicalWidgetConfig;
};

export type ActionId = keyof ActionPayloadMap;

/**
 * A DB commit function applies the validated, authorized payload.
 * `TData` is the value returned to the caller on success.
 */
export type CommitFn<TData = unknown> = (
  context: AuthContext,
  payload: CanonicalWidgetConfig | { mode: PersonaMode }
) => Promise<TData>;

interface ActionEntry {
  id: ActionId;
  schema: z.ZodType<unknown>;
  policy: ActionPolicy;
  commit: CommitFn<unknown>;
}

// ──────────────────────────────────────────────────────────────────────────────
// Registry store
// ──────────────────────────────────────────────────────────────────────────────

const registry = new Map<ActionId, ActionEntry>();

export function registerAction<T extends ActionId>(config: {
  id: T;
  schema?: z.ZodType<ActionPayloadMap[T]>;
  policy?: ActionPolicy;
  commit: CommitFn<Awaited<ReturnType<CommitFn>>>;
}): void {
  if (registry.has(config.id)) {
    throw new Error(`Action "${config.id}" is already registered`);
  }

  registry.set(config.id, {
    id: config.id,
    schema: (config.schema ?? CanonicalWidgetConfigSchema) as z.ZodType<unknown>,
    policy: config.policy ?? {},
    commit: config.commit as CommitFn<unknown>,
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// Dispatch
// ──────────────────────────────────────────────────────────────────────────────

export async function dispatchAction<TData = unknown>(
  id: ActionId,
  rawPayload: unknown,
  context: AuthContext,
  db: { enforce: typeof AuthMiddleware.enforce; authDb: Parameters<typeof AuthMiddleware.enforce>[0] }
): Promise<ActionOutcome<TData>> {
  const entry = registry.get(id);
  if (!entry) {
    return {
      ok: false,
      error: { code: 'UNKNOWN_ACTION', message: `No action registered for "${id}".` },
    };
  }

  // 1. Validate
  let validated: unknown;
  try {
    validated = entry.schema.parse(rawPayload);
  } catch (err) {
    const issues = err instanceof ZodError ? err.issues : undefined;
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'The provided configuration is invalid.',
        details: issues,
      },
    };
  }

  // 2. Authorize
  const auth: AuthResult = await db.enforce(db.authDb, context, entry.policy);
  if (!auth.ok) {
    return {
      ok: false,
      error: {
        code: 'AUTH_ERROR',
        message: auth.error.message,
        details: auth.error,
      },
    };
  }

  // 3. Commit
  try {
    const data = (await entry.commit(context, validated as CanonicalWidgetConfig | { mode: PersonaMode })) as TData;
    return { ok: true, data };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: { code: 'COMMIT_ERROR', message: 'Failed to persist the change.', details: message },
    };
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers (for the Conversational AI)
// ──────────────────────────────────────────────────────────────────────────────

/** Format any ActionOutcome into a single user-facing sentence. */
export function describeOutcome(outcome: ActionOutcome): string {
  if (outcome.ok) return 'Your changes have been saved.';
  switch (outcome.error.code) {
    case 'VALIDATION_ERROR':
      return 'Some of the settings you provided were not valid. Please check them and try again.';
    case 'AUTH_ERROR':
      return outcome.error.message;
    case 'COMMIT_ERROR':
      return 'We could not save your changes right now. Please try again in a moment.';
    default:
      return 'Something went wrong while applying your request.';
  }
}
