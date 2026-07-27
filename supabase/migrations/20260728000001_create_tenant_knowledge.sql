-- =============================================================================
-- Tenant Knowledge Base Table
-- =============================================================================
-- Provides a structured knowledge base for each tenant. Entries are keyed by
-- tenant and can be grouped by optional category for UI organization.
--
-- Access pattern:
--   * Client routes resolve the tenant from the authenticated session.
--   * Reseller routes validate explicit tenant ownership before touching rows.
--   * All writes are performed via supabaseAdmin (service role) from the API
--     routes, so RLS policies here are a defense-in-depth boundary, not the
--     primary enforcement mechanism.
-- =============================================================================

CREATE TABLE IF NOT EXISTS tenant_knowledge (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Fast lookups of all knowledge entries for a given tenant.
CREATE INDEX IF NOT EXISTS idx_tenant_knowledge_tenant_id
  ON tenant_knowledge(tenant_id);

-- Fast lookups of active entries for a given tenant (UI filtering).
CREATE INDEX IF NOT EXISTS idx_tenant_knowledge_tenant_active
  ON tenant_knowledge(tenant_id, is_active);

-- Keep updated_at fresh on every write (Postgres lacks a native
-- "ON UPDATE" clause for TIMESTAMP columns, so use a trigger).
CREATE OR REPLACE FUNCTION set_tenant_knowledge_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tenant_knowledge_updated_at ON tenant_knowledge;
CREATE TRIGGER trg_tenant_knowledge_updated_at
  BEFORE UPDATE ON tenant_knowledge
  FOR EACH ROW
  EXECUTE FUNCTION set_tenant_knowledge_updated_at();

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
-- Scoped the same way as client_memories: an authenticated user may only touch
-- knowledge rows that belong to a tenant owned by one of their linked resellers
-- (via the user_resellers junction table). This keeps each reseller's knowledge
-- base isolated from every other reseller.
ALTER TABLE tenant_knowledge ENABLE ROW LEVEL SECURITY;

-- SELECT: read knowledge entries for tenants the user is linked to.
DROP POLICY IF EXISTS "users_read_own_tenant_knowledge" ON tenant_knowledge;
CREATE POLICY "users_read_own_tenant_knowledge" ON tenant_knowledge
  FOR SELECT
  USING (
    tenant_id IN (
      SELECT t.id FROM tenants t
      JOIN user_resellers ur ON ur.reseller_id = t.reseller_id
      WHERE ur.user_id = auth.uid()
    )
  );

-- INSERT/UPDATE/DELETE: write only to a tenant the user owns, and never to
-- another tenant (WITH CHECK enforces tenant ownership on the new row too).
DROP POLICY IF EXISTS "users_write_own_tenant_knowledge" ON tenant_knowledge;
CREATE POLICY "users_write_own_tenant_knowledge" ON tenant_knowledge
  FOR ALL
  USING (
    tenant_id IN (
      SELECT t.id FROM tenants t
      JOIN user_resellers ur ON ur.reseller_id = t.reseller_id
      WHERE ur.user_id = auth.uid()
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT t.id FROM tenants t
      JOIN user_resellers ur ON ur.reseller_id = t.reseller_id
      WHERE ur.user_id = auth.uid()
    )
  );

-- -----------------------------------------------------------------------------
-- Documentation comments
-- -----------------------------------------------------------------------------
COMMENT ON TABLE tenant_knowledge IS 'Per-tenant structured knowledge base for the AI concierge (FAQ, manuals, policies, etc.).';
COMMENT ON COLUMN tenant_knowledge.id IS 'Primary key (UUID v4).';
COMMENT ON COLUMN tenant_knowledge.tenant_id IS 'Tenant the entry belongs to (FK → tenants.id).';
COMMENT ON COLUMN tenant_knowledge.title IS 'Short display title for the knowledge entry.';
COMMENT ON COLUMN tenant_knowledge.content IS 'Full text content of the knowledge entry.';
COMMENT ON COLUMN tenant_knowledge.category IS 'Optional grouping category for UI filtering (e.g., faq, policies, products).';
COMMENT ON COLUMN tenant_knowledge.is_active IS 'Whether the entry is currently active in the knowledge base.';
COMMENT ON COLUMN tenant_knowledge.created_at IS 'Immutable creation timestamp (UTC).';
COMMENT ON COLUMN tenant_knowledge.updated_at IS 'Last-modified timestamp; bumped automatically by trigger.';
