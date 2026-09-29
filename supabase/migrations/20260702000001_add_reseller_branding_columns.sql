-- Migration: Add reseller branding and asset schema
ALTER TABLE resellers 
  ADD COLUMN IF NOT EXISTS branding JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS branding_colors JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS branding_assets JSONB DEFAULT '{}'::jsonb;
