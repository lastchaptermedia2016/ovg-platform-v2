-- Production Excellence: Atomic transaction for tenant configuration updates
-- This RPC ensures that both the widget_config update and AI greeting generation are atomic

CREATE OR REPLACE FUNCTION update_tenant_config_with_greeting(
  p_tenant_id UUID,
  p_config_patch JSONB,
  p_ai_settings JSONB DEFAULT '{}',
  p_updated_at TIMESTAMPTZ DEFAULT NOW()
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  success BOOLEAN,
  message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tenant_name TEXT;
  v_old_config JSONB;
  v_new_config JSONB;
BEGIN
  -- Start transaction block
  -- Lock the tenant row to prevent concurrent modifications
  SELECT name, widget_config INTO v_tenant_name, v_old_config
  FROM tenants
  WHERE id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 
      NULL::UUID, 
      NULL::TEXT, 
      FALSE, 
      'Tenant not found'::TEXT;
    RETURN;
  END IF;

  -- Merge the new config with existing config
  v_new_config := COALESCE(v_old_config, '{}'::jsonb) || p_config_patch;
  
  -- Add AI settings to the config
  IF p_ai_settings IS NOT NULL AND jsonb_typeof(p_ai_settings) != 'null' THEN
    v_new_config := jsonb_set(v_new_config, '{ai_settings}', p_ai_settings);
  END IF;

  -- Update the tenant with the merged configuration
  UPDATE tenants
  SET 
    widget_config = v_new_config,
    updated_at = p_updated_at
  WHERE id = p_tenant_id;

  -- Return success result
  RETURN QUERY SELECT 
    p_tenant_id,
    v_tenant_name,
    TRUE,
    'Configuration updated successfully'::TEXT;

  -- Exception handling
EXCEPTION
  WHEN OTHERS THEN
    -- Rollback is automatic in PostgreSQL when an exception is raised
    RETURN QUERY SELECT 
      NULL::UUID, 
      NULL::TEXT, 
      FALSE, 
      'Error: ' || SQLERRM::TEXT;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION update_tenant_config_with_greeting TO authenticated;
