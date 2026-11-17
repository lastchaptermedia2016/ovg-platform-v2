-- Fix: get_public_widget_config 404s for tenants whose tenant_id is UUID-shaped
--
-- WHY:
--   The widget embed route passes the URL param straight into this RPC. The
--   previous lookup strategy was format-switched: UUID-shaped params were
--   matched against tenants.id ONLY, non-UUID params against tenants.tenant_id.
--   That breaks tenants whose public tenant_id column itself holds a UUID
--   (e.g. "Levers and Locks", tenant_id = 96050056-eb67-4723-afe8-c03d5ec5a8fc,
--   id = a09abacb-00d9-4ce6-9945-34c7cdaada4e): the embed param is UUID-shaped,
--   so the tenant_id branch is never consulted and the widget page 404s.
--   The reseller DeploymentStudio generates snippets from
--   `tenant_id || id`, so every such tenant shipped a broken snippet.
--
-- WHAT THIS MIGRATION DOES:
--   Replaces the function so tenant_id is ALWAYS checked, with the id column
--   checked additionally for UUID-shaped params. Postgres can satisfy the OR
--   via BitmapOr across idx_tenants_id_pkey and idx_tenants_tenant_id, so the
--   original index-usage concern from 20260718000002 is preserved. LIMIT 1
--   keeps .maybeSingle() callers safe in the theoretical case a tenant_id
--   collides with another tenant's id.
--
-- SECURITY:
--   Same allowlisted projection as before — branding, greeting,
--   suggestedActions, features. No new keys exposed; SECURITY DEFINER and
--   grants unchanged (idempotent CREATE OR REPLACE / GRANT).

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
    -- UUID-shaped params: match the PK ...
    (p_tenant_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' AND id = p_tenant_id::uuid)
    OR
    -- ... and ALWAYS match the public tenant_id column (covers UUID-shaped slugs)
    tenant_id = p_tenant_id
  LIMIT 1;
$$;

-- Anon + authenticated may execute the public loader; it returns only scoped data.
GRANT EXECUTE ON FUNCTION get_public_widget_config(TEXT) TO anon, authenticated;

DO $$
BEGIN
  RAISE NOTICE 'OVG-PLATFORM-V2: get_public_widget_config now matches tenant_id for UUID-shaped embed params too';
END $$;
