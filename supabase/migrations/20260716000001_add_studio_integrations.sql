-- =============================================================================
-- Studio Integrations configuration
-- =============================================================================
-- Integrations (Smart Booking, Live Inventory, CRM Lead Sync, Vector
-- Knowledge-Base, WhatsApp/SMS) are stored as part of the existing
-- `tenants.widget_config` JSONB blob, under the top-level `integrations` key.
-- No new table or column is required — this mirrors how `branding` and
-- `aiPersona` already live inside `widget_config`, keeping a single source of
-- truth across the client and reseller portals.
--
-- Example shape (sensitive fields are encrypted at the application layer):
--   widget_config->'integrations' = {
--     "smart-booking": { "enabled": true, "calendarLink": "https://calendly.com/...", "bookingWindow": "Business hours" },
--     "live-inventory": { "enabled": true, "inventoryApi": "https://api.store/v1/products", "syncFrequency": "Hourly" },
--     "crm-sync":      { "enabled": true, "crmProvider": "HubSpot", "crmApiKey": {"v":1,"iv":"..","tag":"..","data":".."}, "crmPushCadence": "Realtime" },
--     "vector-kb":     { "enabled": true, "vectorSources": ["handbook.pdf"] },
--     "whatsapp-sms":  { "enabled": true, "messagingChannel": "WhatsApp", "twilioAuthToken": {"v":1,...}, "businessPhone": "+1..." }
--   }
--
-- Sensitive credentials (see SENSITIVE_INTEGRATION_FIELDS in
-- client-config.schema.ts) are AES-256-GCM encrypted by
-- src/lib/security/integration-secrets.ts BEFORE being written here. Plaintext
-- secrets never reach the database, and the read endpoint returns only an
-- `isConfigured` boolean instead of the secret. The encryption key is supplied
-- via the INTEGRATIONS_ENCRYPTION_KEY environment variable.
-- =============================================================================

-- Ensure the widget_config column exists as JSONB (idempotent; it already does
-- in existing tenants). This guards against a fresh install where the column
-- might be missing under a different name.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tenants' AND column_name = 'widget_config'
  ) THEN
    ALTER TABLE tenants ADD COLUMN widget_config JSONB NOT NULL DEFAULT '{}'::jsonb;
  END IF;
END $$;

-- Index to accelerate reads that filter on the integrations subtree (used by
-- the prefill GET and the reseller portal lookups). GIN over JSONB enables
-- efficient containment queries.
CREATE INDEX IF NOT EXISTS idx_tenants_widget_config_gin
  ON tenants USING GIN (widget_config);

COMMENT ON COLUMN tenants.widget_config IS 'Canonical JSONB config blob: branding, aiPersona, features, and integrations sub-keys share one source of truth across client and reseller portals.';
