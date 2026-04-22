/**
 * Returns the current tenant ID for the chatwidget.
 * Used for multi-tenant / white-label isolation.
 * Server-side version - tenant ID must be passed from request body or headers.
 */
export function getTenantId(tenantId?: string): string {
  // Use provided tenantId from request body
  if (tenantId) {
    return tenantId;
  }

  // Fallback for development
  console.warn('No tenant ID provided. Using fallback "demo" for development.');
  return "demo";
}
