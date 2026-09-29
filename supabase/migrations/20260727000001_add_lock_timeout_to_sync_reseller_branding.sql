-- Add lock_timeout to sync_reseller_branding so FOR UPDATE waits are bounded.
-- This prevents indefinite lock waits that hit the 60s statement_timeout.
--
-- Mirrors the live schema assumptions from 20260717:
--   resellers.branding (jsonb), branding_colors (jsonb), logo_url (text)
--   No branding_bag, no version_stamp.

CREATE OR REPLACE FUNCTION sync_reseller_branding(
  p_tenant_id TEXT,
  p_branding_bag JSONB,
  p_expected_version INTEGER
)
RETURNS TABLE (
  success BOOLEAN,
  new_version INTEGER,
  conflict_diff JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_branding JSONB;
BEGIN
  SET LOCAL lock_timeout = '5s';

  -- Lock the row for the duration of this transaction (prevents race conditions)
  SELECT branding
  INTO v_current_branding
  FROM resellers
  WHERE tenant_id::text = p_tenant_id
  FOR UPDATE;

  -- If no row found, return error
  IF v_current_branding IS NULL THEN
    RETURN QUERY SELECT
      false::BOOLEAN,
      0::INTEGER,
      jsonb_build_object(
        'message', 'Reseller not found for the given tenant_id'
      );
    RETURN;
  END IF;

  -- Atomic update: branding bag and backward-compatible scalar columns.
  -- version_stamp conflict detection removed (column absent on live DB).
  -- branding_bag removed (column absent on live DB); we write resellers.branding.
  -- Atomic update: branding bag (resellers.branding jsonb) and
  -- backward-compatible branding_colors (primary/secondary) + logo_url.
  -- version_stamp and branding_bag removed (columns absent on live DB).
  UPDATE resellers
  SET
    branding       = p_branding_bag,
    branding_colors = jsonb_build_object(
      'primary',   p_branding_bag->>'primaryColor',
      'secondary', p_branding_bag->>'accentColor'
    ),
    logo_url       = p_branding_bag->>'logoUrl'
  WHERE tenant_id::text = p_tenant_id;

  RETURN QUERY SELECT
    true::BOOLEAN,
    1::INTEGER,
    NULL::JSONB;
END;
$$;

-- Revoke execute from public; only authenticated users via RLS can call
REVOKE EXECUTE ON FUNCTION sync_reseller_branding(TEXT, JSONB, INTEGER) FROM PUBLIC;

-- Add comment for documentation
COMMENT ON FUNCTION sync_reseller_branding IS 'Atomic reseller branding commit. Writes resellers.branding + backward-compatible scalar columns. version_stamp and branding_bag removed (absent on live DB). Lock timeout set to 5s to bound FOR UPDATE waits.';

-- Log the deployment
DO $$
BEGIN
  RAISE NOTICE 'OVG-PLATFORM-V2: sync_reseller_branding RPC re-deployed with 5s lock_timeout';
END $$;
