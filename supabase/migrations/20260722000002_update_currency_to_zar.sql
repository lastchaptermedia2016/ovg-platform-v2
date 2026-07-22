-- Migration: Update currency defaults from USD to ZAR
-- This ensures all future calculations are handled in South African Rands

-- Add currency column to tenants table if it doesn't exist
ALTER TABLE tenants 
ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'ZAR',
ADD CONSTRAINT currency_check 
CHECK (currency IN ('ZAR', 'USD', 'EUR', 'GBP'));

-- Update existing tenants to use ZAR
UPDATE tenants 
SET currency = 'ZAR' 
WHERE currency IS NULL OR currency = 'USD';

-- Add currency column to any financial tables
-- Example: transactions, invoices, etc.

-- Update any default values in table comments
COMMENT ON COLUMN tenants.currency IS 'Currency code for this tenant (default: ZAR for South African Rand)';

-- Create index for currency-based queries
CREATE INDEX IF NOT EXISTS idx_tenants_currency ON tenants(currency);
