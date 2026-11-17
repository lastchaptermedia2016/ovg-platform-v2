-- Add peekMessage + peekCta to the public widget config allowlist
--
-- WHY:
--   The minimized widget's peek teaser previously rendered a hardcoded
--   default ("Ready to see the future of AI-powered business?") with a
--   literal "Chat with us →" CTA in ChatWidget.tsx. Tenants now get
--   configurable teaser copy via tenants.widget_config.peekMessage and
--   widget_config.peekCta (both optional; the widget falls back to a
--   neutral default and "Chat with us →" respectively).
--
-- WHAT THIS MIGRATION DOES:
--   Replaces get_public_widget_config so the allowlisted projection
--   includes the two new keys. Lookup strategy, LIMIT 1, SECURITY DEFINER
--   and grants are carried over unchanged from
--   20261116000003_fix_get_public_widget_config_uuid_slug_lookup.sql.
--
-- SECURITY:
--   PRIVATE-BY-DEFAULT allowlist principle preserved: only explicitly
--   listed keys reach the anonymous embed. peekMessage/peekCta are short
--   display strings rendered in the teaser popup — no secrets or prompts.
--   Idempotent via CREATE OR REPLACE / GRANT.

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
      'peekMessage',      COALESCE(widget_config->'peekMessage', '""'::jsonb),
      'peekCta',          COALESCE(widget_config->'peekCta', '""'::jsonb),
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

COMMENT ON FUNCTION get_public_widget_config IS
  'Anonymous-safe widget config loader. Returns only branding, greeting, peekMessage, peekCta, suggestedActions and features, completely isolating internal studio states (incl. widget_studio) and all secrets/prompts.';

DO $$
BEGIN
  RAISE NOTICE 'OVG-PLATFORM-V2: get_public_widget_config now projects peekMessage and peekCta';
END $$;
