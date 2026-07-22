-- Backfill legacy widget_studio.aiPersona into the canonical widget_config.aiPersona.
--
-- checkTenantAiExecutePermission reads the canonical path
-- widget_config.aiPersona.conversationStyle.actionCapabilities.canExecute first,
-- then falls back to widget_config.widget_studio.aiPersona during the
-- deprecation window. Tenants whose persona was written before the canonical
-- shape shipped (and never re-saved via AIPersonaSettings) keep hitting that
-- legacy fallback on every AI branding command. This migration promotes the
-- data so the canonical read path is taken.
--
-- widget_studio is intentionally left in place as a safety net; the fallback
-- remains but stops triggering once aiPersona is populated.

UPDATE tenants
SET widget_config = jsonb_set(
  widget_config,
  '{aiPersona}',
  widget_config->'widget_studio'->'aiPersona'
)
WHERE widget_config IS NOT NULL
  AND widget_config ? 'widget_studio'
  AND widget_config->'widget_studio' ? 'aiPersona'
  AND widget_config->'widget_studio'->'aiPersona' IS NOT NULL
  AND (
    widget_config->'aiPersona' IS NULL
    OR widget_config->'aiPersona' = 'null'::jsonb
  );

DO $$
DECLARE
  legacy_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO legacy_count
  FROM tenants
  WHERE widget_config IS NOT NULL
    AND widget_config ? 'widget_studio'
    AND widget_config->'widget_studio' ? 'aiPersona'
    AND (widget_config->'aiPersona' IS NULL);

  IF legacy_count > 0 THEN
    RAISE WARNING 'Backfill incomplete: % tenants still rely on legacy widget_studio.aiPersona', legacy_count;
  ELSE
    RAISE NOTICE 'widget_studio -> aiPersona backfill complete; no tenants remain on the legacy path.';
  END IF;
END $$;
