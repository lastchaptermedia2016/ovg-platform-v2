import {
  SENSITIVE_INTEGRATION_FIELDS,
  type ClientIntegrations,
} from '@/lib/schemas/client-config.schema';
import { decryptSecret, encryptSecret, isEncryptedSecret } from '@/lib/security/integration-secrets';

// ────────────────────────────────────────────────────────────────────
// Shared integration crypto helpers
// ────────────────────────────────────────────────────────────────────
// Used by BOTH the direct /client save path and the /reseller managed-service
// delegation path so encryption + read-side sanitization never diverge. Single
// source of truth for how sensitive integration secrets are handled.

/**
 * Encrypt any field listed in SENSITIVE_INTEGRATION_FIELDS. Idempotent: if a
 * value is already an encrypted envelope it is left untouched, so a re-save
 * with a masked value (e.g. the UI sends "••••") does not overwrite a good
 * secret with garbage. An empty/null value clears the stored secret.
 */
export function encryptSensitiveIntegrationFields(
  config: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...config };
  for (const field of SENSITIVE_INTEGRATION_FIELDS) {
    const value = result[field];
    if (typeof value === 'string' && value.length > 0 && !isEncryptedSecret(value)) {
      result[field] = encryptSecret(value);
    } else if (value === '' || value === null || value === undefined) {
      // Empty value clears the stored secret rather than writing ciphertext.
      result[field] = null;
    }
  }
  return result;
}

/**
 * Replace sensitive fields with a boolean `isConfigured` flag so the read
 * payload never carries secrets to the browser (client or reseller surface).
 */
export function sanitizeIntegrationsForRead(
  integrations: ClientIntegrations | Record<string, unknown> | null | undefined
): ClientIntegrations {
  if (!integrations) return {};
  const result: Record<string, Record<string, unknown>> = {};
  for (const [id, cfgRaw] of Object.entries(integrations)) {
    const cfg = { ...(cfgRaw as Record<string, unknown>) };
    for (const field of SENSITIVE_INTEGRATION_FIELDS) {
      const value = cfg[field];
      const isSet = isEncryptedSecret(value) && decryptSecret(value as never) !== null;
      cfg[field] = { isConfigured: Boolean(isSet) };
    }
    result[id] = cfg;
  }
  return result as ClientIntegrations;
}
