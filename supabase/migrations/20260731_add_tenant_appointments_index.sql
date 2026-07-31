CREATE INDEX IF NOT EXISTS idx_tenant_appointments_tenant_start
  ON tenant_appointments(tenant_id, start_time DESC);
