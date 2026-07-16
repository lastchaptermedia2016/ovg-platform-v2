-- =============================================================================
-- Client Relational Memory Store
-- =============================================================================
-- Provides schema-level "humanistic memory" for the AI Concierge. Two axes:
--   * Identity Memory  — who SHE is (business name, brand, role) is sourced from
--                        the tenant row (tenants.name / branding_colors).
--   * Relational Memory — who she is TALKING TO (client name, client business
--                        name, personal preferences, prior-conversation notes)
--                        is stored here, keyed per (tenant, client) pair.
--
-- Each fact is a small key/value cell. The UNIQUE(tenant_id, client_id,
-- memory_key) constraint makes upserts idempotent (one row per fact).
-- =============================================================================

CREATE TABLE IF NOT EXISTS client_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_id UUID NOT NULL, -- Ties to the active user session/profile
  memory_key VARCHAR(100) NOT NULL, -- e.g., 'client_name', 'company_name', 'preferences'
  memory_value TEXT NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE(tenant_id, client_id, memory_key)
);

-- Fast lookups of all memories for a given client within a tenant.
CREATE INDEX IF NOT EXISTS idx_client_memories_tenant_client
  ON client_memories(tenant_id, client_id);

-- Keep updated_at fresh on every write (Postgres lacks a native
-- "ON UPDATE" clause for TIMESTAMP columns, so use a trigger).
CREATE OR REPLACE FUNCTION set_client_memories_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_client_memories_updated_at ON client_memories;
CREATE TRIGGER trg_client_memories_updated_at
  BEFORE UPDATE ON client_memories
  FOR EACH ROW
  EXECUTE FUNCTION set_client_memories_updated_at();

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
-- Scoped the same way as chat_messages / action_logs: an authenticated user may
-- only touch memory rows that belong to a tenant owned by one of their linked
-- resellers (via the user_resellers junction table). This keeps each reseller's
-- client memories isolated from every other reseller.
ALTER TABLE client_memories ENABLE ROW LEVEL SECURITY;

-- SELECT: read memories for tenants the user is linked to.
DROP POLICY IF EXISTS "users_read_own_tenant_client_memories" ON client_memories;
CREATE POLICY "users_read_own_tenant_client_memories" ON client_memories
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
DROP POLICY IF EXISTS "users_write_own_tenant_client_memories" ON client_memories;
CREATE POLICY "users_write_own_tenant_client_memories" ON client_memories
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
COMMENT ON TABLE client_memories IS 'Relational memory store: per-client facts the AI Concierge recalls (client name, company, preferences, prior context).';
COMMENT ON COLUMN client_memories.tenant_id IS 'Tenant the memory belongs to (FK → tenants.id).';
COMMENT ON COLUMN client_memories.client_id IS 'Active user session/profile the memory is about.';
COMMENT ON COLUMN client_memories.memory_key IS 'Stable fact key, e.g. client_name, company_name, preferences.';
COMMENT ON COLUMN client_memories.memory_value IS 'Free-text or JSON-encoded value for the fact.';
COMMENT ON COLUMN client_memories.updated_at IS 'Last write time; bumped automatically by trigger.';
