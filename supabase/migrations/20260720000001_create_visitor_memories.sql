-- =============================================================================
-- Anonymous Visitor Relational Memory Store
-- =============================================================================
-- Provides "humanistic memory" for anonymous (unauthenticated) widget visitors
-- who have self-identified via contact details during a conversation.
--
-- Unlike client_memories (which is keyed to an authenticated user session),
-- visitor_memories is keyed to a self-reported contact detail:
--   (tenant_id, identity_type, identity_value) -> memory facts
--
-- identity_type is constrained to 'phone' | 'email'.
-- identity_value is the normalized contact value (digits-only for phone,
-- lowercase-trimmed for email).
--
-- A UNIQUE constraint on (tenant_id, identity_type, identity_value, memory_key)
-- makes upserts idempotent.
-- =============================================================================

CREATE TABLE IF NOT EXISTS visitor_memories (
  tenant_id      UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  identity_type  TEXT        NOT NULL CHECK (identity_type = ANY (ARRAY['phone','email'])),
  identity_value TEXT        NOT NULL,
  memory_key     TEXT        NOT NULL,
  memory_value   TEXT        NOT NULL,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  last_seen_at   TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE(tenant_id, identity_type, identity_value, memory_key)
);

-- Fast lookups of all memories for a given visitor identity within a tenant.
CREATE INDEX IF NOT EXISTS idx_visitor_memories_lookup
  ON visitor_memories(tenant_id, identity_type, identity_value);

-- Fast cleanup of expired rows.
CREATE INDEX IF NOT EXISTS idx_visitor_memories_last_seen
  ON visitor_memories(last_seen_at);

-- Keep updated_at fresh on every write.
CREATE OR REPLACE FUNCTION set_visitor_memories_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_visitor_memories_updated_at ON visitor_memories;
CREATE TRIGGER trg_visitor_memories_updated_at
  BEFORE UPDATE ON visitor_memories
  FOR EACH ROW
  EXECUTE FUNCTION set_visitor_memories_updated_at();

-- =============================================================================
-- Row Level Security
-- =============================================================================
-- visitor_memories is written exclusively via supabaseAdmin (service role) from
-- the process-command route — no direct client writes. Reads are also admin-scoped
-- because anonymous visitors have no auth.uid() to bind a policy to.
-- Therefore we disable RLS and rely on application-level tenant scoping.
-- =============================================================================
ALTER TABLE visitor_memories DISABLE ROW LEVEL SECURITY;

-- =============================================================================
-- Documentation comments
-- =============================================================================
COMMENT ON TABLE visitor_memories IS 'Relational memory store for anonymous widget visitors, keyed by self-reported phone/email. Auto-expired after 12 months of inactivity.';
COMMENT ON COLUMN visitor_memories.tenant_id IS 'Tenant the memory belongs to (FK → tenants.id).';
COMMENT ON COLUMN visitor_memories.identity_type IS 'Contact channel used for lookup: phone or email.';
COMMENT ON COLUMN visitor_memories.identity_value IS 'Normalized contact value (digits-only for phone, lowercase for email).';
COMMENT ON COLUMN visitor_memories.memory_key IS 'Stable fact key, e.g. client_name, company_name, preferences.';
COMMENT ON COLUMN visitor_memories.memory_value IS 'Free-text value for the fact, max 1000 chars.';
COMMENT ON COLUMN visitor_memories.updated_at IS 'Last write time; bumped automatically by trigger.';
COMMENT ON COLUMN visitor_memories.last_seen_at IS 'Last time this visitor was active; drives 12-month retention expiration.';
