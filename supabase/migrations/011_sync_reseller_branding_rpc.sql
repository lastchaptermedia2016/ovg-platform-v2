-- CRITICAL: Atomic branding commit with optimistic concurrency control
-- This RPC locks the resellers row, checks version_stamp, and updates atomically
-- Returns: success BOOLEAN, new_version INTEGER, conflict_diff JSONB
CREATE OR REPLACE FUNCTION sync_reseller_branding(
  p_tenant_id       TEXT,
  p_branding_bag    JSONB,
  p_expected_version INTEGER
)
RETURNS TABLE (
  success       BOOLEAN,
  new_version   INTEGER,
  conflict_diff JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_version INTEGER;
  v_current_bag     JSONB;
BEGIN
  -- Lock the row for the duration of this transaction (prevents race conditions)
  SELECT version_stamp, branding_bag
  INTO v_current_version, v_current_bag
  FROM resellers
  WHERE tenant_id = p_tenant_id
  FOR UPDATE;

  -- If no row found, return error
  IF v_current_version IS NULL THEN
    RETURN QUERY SELECT
      false::BOOLEAN,
      0::INTEGER,
      jsonb_build_object(
        'message', 'Reseller not found for the given tenant_id'
      );
    RETURN;
  END IF;

  -- Conflict detection: version mismatch means another session modified branding
  IF v_current_version != p_expected_version THEN
    RETURN QUERY SELECT
      false::BOOLEAN,
      v_current_version::INTEGER,
      jsonb_build_object(
        'expectedVersion', p_expected_version,
        'currentVersion',  v_current_version,
        'committedBag',    v_current_bag,
        'message',         'Branding was modified by another session since you started editing'
      );
    RETURN;
  END IF;

  -- Atomic update: branding_bag, version_stamp, and backward-compatible columns
  UPDATE resellers
  SET
    branding_bag    = p_branding_bag,
    version_stamp   = v_current_version + 1,
    updated_at      = NOW(),
    -- Maintain backward compatibility with existing columns
    branding_color  = p_branding_bag->>'primaryColor',
    accent_color    = p_branding_bag->>'accentColor',
    logo_url        = p_branding_bag->>'logoUrl'
  WHERE tenant_id = p_tenant_id;

  RETURN QUERY SELECT
    true::BOOLEAN,
    (v_current_version + 1)::INTEGER,
    NULL::JSONB;
END;
$$;

-- Revoke execute from public; only authenticated users via RLS can call
REVOKE EXECUTE ON FUNCTION sync_reseller_branding(TEXT, JSONB, INTEGER) FROM PUBLIC;

-- Add comment for documentation
COMMENT ON FUNCTION sync_reseller_branding IS 'Atomic branding commit with optimistic locking. Returns {success, new_version, conflict_diff}. Conflict occurs when version_stamp does not match expected_version.';

-- Log the security implementation
DO $$
BEGIN
  RAISE NOTICE 'OVG-PLATFORM-V2: sync_reseller_branding RPC deployed with SELECT...FOR UPDATE optimistic locking';
END $$;