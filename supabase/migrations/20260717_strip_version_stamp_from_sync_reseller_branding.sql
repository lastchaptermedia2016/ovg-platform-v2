-- Strip the optimistic-concurrency version_stamp check AND the non-existent
-- branding_bag column from sync_reseller_branding.
--
-- On the LIVE database, resellers has NEITHER branding_bag NOR version_stamp
-- (migration 010 never applied). The columns that actually exist are:
--   branding (jsonb), branding_colors (jsonb), branding_assets (jsonb),
--   branding_color (text), accent_color (text), logo_url (text)
-- The function now reads/writes those real columns. Primary source of truth for
-- the propagated tenant branding is resellers.branding (jsonb), kept in parity
-- with tenants.widget_config.branding. Backward-compatible scalar columns
-- (branding_color, accent_color, logo_url) are also maintained so the
-- existing reseller-provider / sync-brand readers stay correct.

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
COMMENT ON FUNCTION sync_reseller_branding IS 'Atomic reseller branding commit. Writes resellers.branding + backward-compatible scalar columns. version_stamp and branding_bag removed (absent on live DB).';

-- Log the deployment
DO $$
BEGIN
  RAISE NOTICE 'OVG-PLATFORM-V2: sync_reseller_branding RPC re-deployed against live resellers schema (branding, not branding_bag)';
END $$;
