-- Migration: Add missing columns to tenants table referenced by create-client route
-- These columns are used by the AI-driven client creation workflow but were
-- never added to the schema, causing PostgREST 42703 (undefined column) errors.

-- 1. is_active — soft-delete / visibility flag
ALTER TABLE tenants
ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- 2. category — client category within their industry
ALTER TABLE tenants
ADD COLUMN IF NOT EXISTS category TEXT;

-- 3. mobile_number — primary contact mobile (E.164 format)
ALTER TABLE tenants
ADD COLUMN IF NOT EXISTS mobile_number TEXT;

-- 4. website_url — client website
ALTER TABLE tenants
ADD COLUMN IF NOT EXISTS website_url TEXT;

-- 5. show_ovg_branding — whether OVG branding is displayed on widget
ALTER TABLE tenants
ADD COLUMN IF NOT EXISTS show_ovg_branding BOOLEAN NOT NULL DEFAULT true;

-- 6. pricing_tier_key — billing plan tier (basic, standard, premium, …)
ALTER TABLE tenants
ADD COLUMN IF NOT EXISTS pricing_tier_key TEXT;

-- 7. custom_assets — JSONB blob for header_url, footer_url, etc.
ALTER TABLE tenants
ADD COLUMN IF NOT EXISTS custom_assets JSONB NOT NULL DEFAULT '{}'::jsonb;

-- 8. plan_tier — legacy alias used by tenants/create route
ALTER TABLE tenants
ADD COLUMN IF NOT EXISTS plan_tier TEXT;

-- 9. branding_colors — JSONB blob { primary, secondary }
ALTER TABLE tenants
ADD COLUMN IF NOT EXISTS branding_colors JSONB NOT NULL DEFAULT '{}'::jsonb;

-- ── Industry CHECK constraint fix ──────────────────────────────────────
-- The original constraint (migration 20260722000001) used lowercase values:
--   CHECK (industry IN ('automotive', 'general', 'retail', 'healthcare',
--                        'real_estate', 'hospitality'))
-- But the application layer sends UPPERCASE values (AUTOMOTIVE, RETAIL, …).
-- Drop the old constraint and replace with one that accepts both cases.
ALTER TABLE tenants
DROP CONSTRAINT IF EXISTS industry_check;

ALTER TABLE tenants
ADD CONSTRAINT industry_check
CHECK (industry IN (
  'automotive', 'general', 'retail', 'healthcare', 'real_estate', 'hospitality',
  'AUTOMOTIVE', 'GENERAL BUSINESS', 'RETAIL', 'HEALTHCARE', 'INSURANCE',
  'AI AUTOMATION'
));

-- Index on is_active for fast filtering of active clients
CREATE INDEX IF NOT EXISTS idx_tenants_is_active ON tenants(is_active);

-- Index on category for filtering
CREATE INDEX IF NOT EXISTS idx_tenants_category ON tenants(category);

-- Index on pricing_tier_key for billing queries
CREATE INDEX IF NOT EXISTS idx_tenants_pricing_tier_key ON tenants(pricing_tier_key);