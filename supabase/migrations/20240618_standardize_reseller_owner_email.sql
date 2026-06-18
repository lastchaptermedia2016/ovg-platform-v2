-- Standardize resellers table owner_email column naming
-- This migration adds owner_email if missing and aligns the schema for multi-tenant ownership

DO $$
BEGIN
  -- Add column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'resellers' AND column_name = 'owner_email'
  ) THEN
    ALTER TABLE resellers ADD COLUMN owner_email TEXT;
  END IF;

  -- Backfill from legacy 'email' column if present and owner_email is null
  UPDATE resellers
  SET owner_email = email
  WHERE owner_email IS NULL AND email IS NOT NULL;

  -- Optional: drop legacy email column after successful backfill
  -- ALTER TABLE resellers DROP COLUMN email;
END $$;

-- Add comment for documentation
COMMENT ON COLUMN resellers.owner_email IS 'Designated owner/admin email for the reseller account';