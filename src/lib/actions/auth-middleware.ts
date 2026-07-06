/**
 * @file auth-middleware.ts
 *
 * Authorization layer for the Action Registry.
 *
 * Enforces a three-part contract before any action touches the data layer:
 *   1. The caller is authenticated (a known user identity).
 *   2. The caller owns, or is permitted to act on, the target tenant.
 *   3. The caller's role is allowed to perform the requested action.
 *
 * The middleware is intentionally free of database logic: it receives a
 * `DbClient` dependency that exposes the queries it needs, so it can be
 * unit-tested with an in-memory fake.
 *
 * Errors are returned as structured objects (never thrown for "expected"
 * auth failures) so the Conversational AI can translate them into a message
 * the end user understands.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { UserRole } from '../auth/roles';
import { getUserRole } from '../auth/roles';

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

/** Identity + tenancy context carried through every action execution. */
export interface AuthContext {
  userId: string;
  tenantId: string;
  /** Optional role override; resolved from the user session when omitted. */
  role?: UserRole;
}

/** Structured, machine-readable authorization failure. */
export interface AuthError {
  code: 'UNAUTHENTICATED' | 'FORBIDDEN' | 'TENANT_ACCESS_DENIED' | 'ROLE_NOT_ALLOWED';
  message: string;
  /** Optional human-readable detail for debugging / audit logs. */
  detail?: string;
}

export type AuthResult = { ok: true } | { ok: false; error: AuthError };

/**
 * Minimal DB surface the middleware depends on. Implemented by Supabase in
 * production and by an in-memory fake in tests.
 */
export interface AuthDbClient {
  /** Returns the reseller_id that owns the given tenant, or null if absent. */
  getTenantResellerId(tenantId: string): Promise<string | null>;
  /** Returns true if the user is linked to the given reseller. */
  isUserInReseller(userId: string, resellerId: string): Promise<boolean>;
  /**
   * Returns the caller's role. Falls back to resolving via getUserRole when
   * the context does not specify one.
   */
  resolveRole(context: AuthContext): Promise<UserRole>;
}

// ──────────────────────────────────────────────────────────────────────────────
// Supabase-backed implementation (production)
// ──────────────────────────────────────────────────────────────────────────────

export function createSupabaseAuthDbClient(client: SupabaseClient): AuthDbClient {
  return {
    async getTenantResellerId(tenantId: string): Promise<string | null> {
      const { data, error } = await client
        .from('tenants')
        .select('reseller_id')
        .eq('id', tenantId)
        .single();

      if (error || !data?.reseller_id) return null;
      return data.reseller_id as string;
    },

    async isUserInReseller(userId: string, resellerId: string): Promise<boolean> {
      const { data } = await client
        .from('user_resellers')
        .select('reseller_id')
        .eq('user_id', userId)
        .eq('reseller_id', resellerId)
        .maybeSingle();

      return Boolean(data);
    },

    async resolveRole(context: AuthContext): Promise<UserRole> {
      if (context.role) return context.role;
      const { data } = await client.auth.admin.getUserById(context.userId).catch(() => ({ data: null }));
      if (data?.user) return getUserRole(data.user as never);
      return 'user';
    },
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Middleware
// ──────────────────────────────────────────────────────────────────────────────

export interface ActionPolicy {
  /** Roles permitted to execute the action. Empty/undefined means "any authenticated user". */
  allowedRoles?: UserRole[];
  /** Whether the caller must own (via reseller) the target tenant. Defaults to true. */
  requireTenantOwnership?: boolean;
}

export const AuthMiddleware = {
  /**
   * Enforce the authorization policy for an action.
   *
   * @returns ok:true when authorized, otherwise a structured AuthError.
   */
  async enforce(
    db: AuthDbClient,
    context: AuthContext,
    policy: ActionPolicy = {}
  ): Promise<AuthResult> {
    if (!context.userId) {
      return {
        ok: false,
        error: { code: 'UNAUTHENTICATED', message: 'A valid user session is required.' },
      };
    }

    const role = await db.resolveRole(context);

    if (policy.allowedRoles && policy.allowedRoles.length > 0) {
      if (!policy.allowedRoles.includes(role)) {
        return {
          ok: false,
          error: {
            code: 'ROLE_NOT_ALLOWED',
            message: `Your role (${role}) is not permitted to perform this action.`,
            detail: `Allowed roles: ${policy.allowedRoles.join(', ')}`,
          },
        };
      }
    }

    const requireOwnership = policy.requireTenantOwnership ?? true;
    if (requireOwnership) {
      const resellerId = await db.getTenantResellerId(context.tenantId);
      if (!resellerId) {
        return {
          ok: false,
          error: {
            code: 'TENANT_ACCESS_DENIED',
            message: 'The requested tenant could not be found or is not assigned to a reseller.',
          },
        };
      }

      const owned = await db.isUserInReseller(context.userId, resellerId);
      if (!owned) {
        return {
          ok: false,
          error: {
            code: 'TENANT_ACCESS_DENIED',
            message: 'You do not have access to this tenant.',
          },
        };
      }
    }

    return { ok: true };
  },
};
