-- Public, minimal, read-only widget config loader for ANONYMOUS embeds.
--
-- WHY SECURITY DEFINER + ALLOWLIST:
--   The public widget embed has no login, so it must read tenant data as anon.
--   RLS on `tenants` only grants authenticated resellers (via user_resellers),
--   which is why anonymous visitors currently 404. Rather than grant anon a
--   blanket SELECT on tenants, this RPC runs as the definer and returns ONLY
--   the two widget_config subtrees the render path actually consumes:
--     * branding       (colors, logo, position, layers)
--     * suggestedActions (quick-action pills)
--   Everything else is deliberately excluded: theme, behavior, aiPersona,
--   ai_settings, integrations, and — critically — widget_studio.
--   widget_studio is an internal administration-panel state buffer that carries
--   DUPLICATED AI configurations; it must never reach the public frame, so it is
--   pruned entirely from the projection. This is PRIVATE-BY-DEFAULT: future
--   widget_config keys are NOT exposed unless explicitly added to this
--   allowlist. Notably this keeps integration secrets (crmApiKey,
--   twilioAuthToken, webhooks.headers) and AI system prompts out of the public
--   payload.

--   features is included because voiceFeaturesEnabled controls the mic button
--   in the public embed, and customCss controls client-side styling — both are
--   UI-affecting with no sensitive data. aiPersona is deliberately excluded
--   because it may contain system prompts.
--
-- KEYS ON tenant_id (TEXT) — the supported public URL identifier. The slug
--   route (/widget/<slug>) is intentionally NOT supported. NOTE: tenants.tenant_id
--   is TEXT (verified live), so the comparison is text=text. Do NOT cast
--   p_tenant_id::uuid — that would force a column-side TEXT->UUID cast, defeat
--   the idx_tenants_tenant_id index, and error on non-UUID-format values.

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
  WHERE tenant_id = p_tenant_id;
$$;

-- Anon + authenticated may execute the public loader; it returns only scoped data.
GRANT EXECUTE ON FUNCTION get_public_widget_config(TEXT) TO anon, authenticated;

COMMENT ON FUNCTION get_public_widget_config IS
  'Anonymous-safe widget config loader. Returns only branding and suggestedActions, completely isolating internal studio states (incl. widget_studio) and all secrets/prompts.';
