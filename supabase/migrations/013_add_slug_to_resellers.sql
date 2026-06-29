-- Add slug column to resellers table for human-readable identifiers
-- This fixes the mismatch between the resolver (which queries 'slug')
-- and the actual database columns.

-- Add the slug column
ALTER TABLE resellers 
ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE;

-- Backfill existing records: use tenant_id as the slug
-- This preserves existing UUID-based lookups while enabling slug-based queries
UPDATE resellers
SET slug = tenant_id
WHERE slug IS NULL;

-- Create index on slug for fast lookups (the resolver uses .eq('slug', identifier))
CREATE INDEX IF NOT EXISTS idx_resellers_slug ON resellers(slug);

-- Verify data integrity
DO $$
DECLARE
  total_count INTEGER;
  slugged_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_count FROM resellers;
  SELECT COUNT(*) INTO slugged_count FROM resellers WHERE slug IS NOT NULL;
  
  RAISE NOTICE 'Resellers migration complete: % total records, % with slug', 
    total_count, slugged_count;
    
  IF total_count != slugged_count THEN
    RAISE WARNING 'Data integrity issue: % records missing slug after migration', 
      total_count - slugged_count;
  END IF;
END $$;

-- Add comment for documentation
COMMENT ON COLUMN resellers.slug IS 'Human-readable unique identifier for reseller (backfilled from tenant_id)';