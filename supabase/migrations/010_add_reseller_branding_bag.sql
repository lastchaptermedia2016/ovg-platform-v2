-- Add branding_bag JSONB column to resellers table for full token management
-- This enables atomic read/write of all branding tokens as a single unit
ALTER TABLE resellers
ADD COLUMN IF NOT EXISTS branding_bag JSONB DEFAULT jsonb_build_object(
  'primaryColor',      '#0097b2',
  'accentColor',       '#D4AF37',
  'logoUrl',           null,
  'favicon',           null,
  'metaTitle',         null,
  'metaDescription',   null,
  'typography',        jsonb_build_object('headingFont', 'Inter', 'bodyFont', 'Inter'),
  'borderRadius',      8,
  'mode',              'light'
);

-- Add version_stamp for optimistic concurrency control
ALTER TABLE resellers ADD COLUMN IF NOT EXISTS version_stamp INTEGER DEFAULT 1;

-- Backfill existing resellers with their current branding_color + accent_color
UPDATE resellers
SET branding_bag = jsonb_build_object(
  'primaryColor',      COALESCE(branding_color, '#0097b2'),
  'accentColor',       COALESCE(accent_color, '#D4AF37'),
  'logoUrl',           logo_url,
  'favicon',           null,
  'metaTitle',         name,
  'metaDescription',   null,
  'typography',        jsonb_build_object('headingFont', 'Inter', 'bodyFont', 'Inter'),
  'borderRadius',      8,
  'mode',              'light'
),
    version_stamp = 1
WHERE branding_bag IS NULL;

-- Create index on branding_bag for potential future GIN queries
CREATE INDEX IF NOT EXISTS idx_resellers_branding_bag_gin ON resellers USING GIN (branding_bag);

-- Add comments for documentation
COMMENT ON COLUMN resellers.branding_bag IS 'Atomic JSONB bag of all branding tokens (colors, typography, logos, metadata)';
COMMENT ON COLUMN resellers.version_stamp IS 'Optimistic concurrency version counter incremented on each branding commit';