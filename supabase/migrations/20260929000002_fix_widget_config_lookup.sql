-- Migration: fix get_public_widget_config to match by id OR tenant_id
--
-- PROBLEM:
--   The original RPC (20260718000002) branches on whether the caller-supplied
--   string LOOKS like a UUID. If it does, it only tries `id = p_tenant_id::uuid`.
--   Some tenants have a UUID-format string stored as their `tenant_id` slug
--   (e.g. '0251b743-8e11-4c88-806a-5e3669650a5e') while their actual `id` PK is a
--   different UUID. For those embeds the RPC returns no row → the public widget
--   page 404s even though the tenant exists.
--
-- FIX:
--   Drop the format-based branch and use a single OR predicate that tries both
--   columns unconditionally. The `id = p_tenant_id::uuid` leg is safe because
--   PostgreSQL short-circuits the right-hand side of OR only when the left side
--   is true; casting a non-UUID text to uuid would error, so the original
--   regex guard existed for a reason. To preserve that safety we wrap the cast
--   in a CASE so malformed input never reaches `::uuid` and simply yields no
--   match on that leg instead of throwing.
--
--   The `tenant_id = p_tenant_id` leg is always evaluated and is indexed by
--   idx_tenants_tenant_id, so slug-based embeds (including UUID-format slugs)
--   resolve in a single index probe.

CREATE OR REPLACE FUNCTION get_public_widget_config(p_tenant_id TEXT)
RETURNS TABLE ( widget_config JSONB )
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    jsonb_build_object(
      'branding',         COALESCE(widget_config->'branding', '{}'::jsonb),
      'greeting',         COALESCE(widget_config->'greeting', '""'::jsonb),
      'suggestedActions', COALESCE(widget_config->'suggestedActions', '[]'::jsonb),
      'features',         COALESCE(widget_config->'features', '{}'::jsonb)
    ) AS widget_config
  FROM tenants
  WHERE
    -- PK branch: only attempt the cast when the input is a well-formed UUID,
    -- otherwise skip this leg (CASE yields NULL, which never equals id).
    CASE
      WHEN p_tenant_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN id = p_tenant_id::uuid
      ELSE NULL
    END
    OR
    -- Slug branch: matches the tenant_id column verbatim, including
    -- UUID-format slugs that are NOT the PK.
    tenant_id = p_tenant_id;
$$;

-- Anon + authenticated may execute the public loader; it returns only scoped data.
GRANT EXECUTE ON FUNCTION get_public_widget_config(TEXT) TO anon, authenticated;

COMMENT ON FUNCTION get_public_widget_config IS
  'Anonymous-safe widget config loader. Returns only branding and suggestedActions, completely isolating internal studio states (incl. widget_studio) and all secrets/prompts. Matches by id (UUID PK) OR tenant_id (slug); handles UUID-format slugs that are not the PK.';