-- Migration: Add industry and industry_config to tenants table
-- This enables multi-industry support with scalable feature configuration

-- Add industry column (enum-like constraint via check)
ALTER TABLE tenants 
ADD COLUMN industry TEXT NOT NULL DEFAULT 'general',
ADD CONSTRAINT industry_check 
CHECK (industry IN ('automotive', 'general', 'retail', 'healthcare', 'real_estate', 'hospitality'));

-- Add industry_config column (JSONB for flexible feature flags)
ALTER TABLE tenants 
ADD COLUMN industry_config JSONB DEFAULT '{}';

-- Create index on industry for faster queries
CREATE INDEX idx_tenants_industry ON tenants(industry);

-- Create GIN index on industry_config for JSONB queries
CREATE INDEX idx_tenants_industry_config ON tenants USING GIN(industry_config);

-- Update existing tenants to have 'general' industry
UPDATE tenants 
SET industry = 'general', 
    industry_config = '{"features": ["contact_management", "lead_tracking", "appointment_scheduler", "document_management"], "super_functions": ["lead_signal", "ai_omni_chat"]}'::jsonb
WHERE industry IS NULL OR industry = '';

-- Example: Set up default config for automotive industry
-- UPDATE tenants 
-- SET industry_config = '{
--   "features": ["inventory_management", "vin_decoder", "test_drive_scheduler", "vehicle_inspection", "trade_in_estimator", "financing_calculator"],
--   "super_functions": ["lead_signal", "ai_omni_chat", "market_analytics", "competitor_pricing"]
-- }'::jsonb
-- WHERE industry = 'automotive';
