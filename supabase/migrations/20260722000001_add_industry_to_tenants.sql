-- Migration: Add industry and industry_config to tenants table
-- This enables multi-industry support with scalable feature configuration
--
-- Idempotent: every statement is guarded so re-running on an already-migrated
-- database reaches the same end state instead of erroring. This matters for CI,
-- where `supabase db reset` re-applies migrations against a fresh project and
-- any bare ALTER/CREATE would fail with "column already exists".

-- Add industry column if it does not already exist.
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS industry TEXT NOT NULL DEFAULT 'general';

-- Add the constraint only if it does not already exist.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'tenants'::regclass
      AND conname = 'industry_check'
  ) THEN
    ALTER TABLE tenants
      ADD CONSTRAINT industry_check
      CHECK (
        industry IN (
          'automotive',
          'general',
          'retail',
          'healthcare',
          'real_estate',
          'hospitality'
        )
      );
  END IF;
END
$$;

-- Add the JSONB column if it does not already exist.
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS industry_config JSONB DEFAULT '{}'::jsonb;

-- Backfill existing rows safely. Idempotent: rows already populated are
-- left untouched by the NULLIF/COALESCE guards.
UPDATE tenants
SET
  industry = COALESCE(NULLIF(industry, ''), 'general'),
  industry_config = CASE
    WHEN industry_config IS NULL OR industry_config = '{}'::jsonb THEN
      '{
        "features": [
          "contact_management",
          "lead_tracking",
          "appointment_scheduler",
          "document_management"
        ],
        "super_functions": [
          "lead_signal",
          "ai_omni_chat"
        ]
      }'::jsonb
    ELSE industry_config
  END
WHERE industry IS NULL
   OR industry = ''
   OR industry_config IS NULL;

-- Index creation is inherently safe with IF NOT EXISTS.
CREATE INDEX IF NOT EXISTS idx_tenants_industry
  ON tenants(industry);

CREATE INDEX IF NOT EXISTS idx_tenants_industry_config
  ON tenants USING GIN(industry_config);

-- Example: Set up default config for automotive industry
-- UPDATE tenants
-- SET industry_config = '{
--   "features": ["inventory_management", "vin_decoder", "test_drive_scheduler", "vehicle_inspection", "trade_in_estimator", "financing_calculator"],
--   "super_functions": ["lead_signal", "ai_omni_chat", "market_analytics", "competitor_pricing"]
-- }'::jsonb
-- WHERE industry = 'automotive';