-- Standardize resellers table owner_email column naming
ALTER TABLE resellers ADD COLUMN IF NOT EXISTS owner_email TEXT;

COMMENT ON COLUMN resellers.owner_email IS 'Designated owner/admin email for the reseller account';
