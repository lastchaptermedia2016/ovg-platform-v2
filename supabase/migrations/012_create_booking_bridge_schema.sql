-- Provider-adapter booking bridge schema.
-- Internal driver canonical tables for open slot lookup and atomic reservations.

CREATE TABLE IF NOT EXISTS booking_slots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE', 'RESERVED', 'CONFIRMED', 'CANCELLED')),
  capacity INTEGER NOT NULL DEFAULT 1 CHECK (capacity > 0),
  reserved_count INTEGER NOT NULL DEFAULT 0 CHECK (reserved_count >= 0),
  provider_type TEXT NOT NULL DEFAULT 'INTERNAL',
  external_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT booking_slots_time_order CHECK (end_time > start_time),
  CONSTRAINT booking_slots_capacity CHECK (reserved_count <= capacity),
  CONSTRAINT booking_slots_unique_internal_slot UNIQUE (tenant_id, start_time, end_time, provider_type)
);

CREATE TABLE IF NOT EXISTS booking_appointments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  slot_id UUID NOT NULL REFERENCES booking_slots(id) ON DELETE CASCADE,
  client_name TEXT NOT NULL,
  client_phone TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'RESERVED' CHECK (status IN ('RESERVED', 'CONFIRMED')),
  source TEXT NOT NULL DEFAULT 'BRIDGE',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT booking_appointments_unique_slot UNIQUE (slot_id)
);

CREATE INDEX IF NOT EXISTS idx_booking_slots_tenant_date_status
  ON booking_slots (tenant_id, start_time, status);

CREATE INDEX IF NOT EXISTS idx_booking_slots_available
  ON booking_slots (tenant_id, start_time)
  WHERE status = 'AVAILABLE';

CREATE INDEX IF NOT EXISTS idx_booking_appointments_tenant_created
  ON booking_appointments (tenant_id, created_at DESC);

ALTER TABLE booking_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_appointments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "booking_slots_reseller_access" ON booking_slots;
CREATE POLICY "booking_slots_reseller_access" ON booking_slots
  FOR ALL
  USING (
    tenant_id IN (
      SELECT t.id
      FROM tenants t
      WHERE t.reseller_id IN (
        SELECT ur.reseller_id
        FROM user_resellers ur
        WHERE ur.user_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT t.id
      FROM tenants t
      WHERE t.reseller_id IN (
        SELECT ur.reseller_id
        FROM user_resellers ur
        WHERE ur.user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "booking_appointments_reseller_access" ON booking_appointments;
CREATE POLICY "booking_appointments_reseller_access" ON booking_appointments
  FOR ALL
  USING (
    tenant_id IN (
      SELECT t.id
      FROM tenants t
      WHERE t.reseller_id IN (
        SELECT ur.reseller_id
        FROM user_resellers ur
        WHERE ur.user_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT t.id
      FROM tenants t
      WHERE t.reseller_id IN (
        SELECT ur.reseller_id
        FROM user_resellers ur
        WHERE ur.user_id = auth.uid()
      )
    )
  );

CREATE OR REPLACE FUNCTION reserve_booking_slot(
  p_tenant_id UUID,
  p_slot_id UUID,
  p_client_name TEXT,
  p_client_phone TEXT
)
RETURNS TABLE (
  success BOOLEAN,
  message TEXT,
  appointment_id UUID,
  slot_id UUID,
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  status TEXT,
  reserved_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_appointment_id UUID;
  v_reserved_at TIMESTAMPTZ := NOW();
  v_slot booking_slots%ROWTYPE;
BEGIN
  SELECT *
  INTO v_slot
  FROM booking_slots
  WHERE id = p_slot_id
    AND tenant_id = p_tenant_id
    AND status = 'AVAILABLE'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT
      FALSE,
      'Slot is unavailable or does not belong to the tenant',
      NULL::UUID,
      p_slot_id,
      NULL::TIMESTAMPTZ,
      NULL::TIMESTAMPTZ,
      NULL::TEXT,
      v_reserved_at;
    RETURN;
  END IF;

  IF (v_slot.reserved_count + 1) > v_slot.capacity THEN
    RETURN QUERY SELECT
      FALSE,
      'Slot capacity exhausted',
      NULL::UUID,
      p_slot_id,
      v_slot.start_time,
      v_slot.end_time,
      v_slot.status,
      v_reserved_at;
    RETURN;
  END IF;

  v_appointment_id := gen_random_uuid();

  INSERT INTO booking_appointments (
    id,
    tenant_id,
    slot_id,
    client_name,
    client_phone,
    status,
    source,
    metadata,
    created_at,
    updated_at
  ) VALUES (
    v_appointment_id,
    p_tenant_id,
    p_slot_id,
    p_client_name,
    p_client_phone,
    'RESERVED',
    'BRIDGE',
    '{}'::jsonb,
    v_reserved_at,
    v_reserved_at
  );

  UPDATE booking_slots
  SET
    status = 'RESERVED',
    reserved_count = reserved_count + 1,
    updated_at = v_reserved_at
  WHERE id = p_slot_id
    AND tenant_id = p_tenant_id;

  RETURN QUERY SELECT
    TRUE,
    'Reservation committed',
    v_appointment_id,
    v_slot.id,
    v_slot.start_time,
    v_slot.end_time,
    'RESERVED'::TEXT,
    v_reserved_at;

EXCEPTION
  WHEN OTHERS THEN
    RETURN QUERY SELECT
      FALSE,
      SQLERRM,
      NULL::UUID,
      p_slot_id,
      NULL::TIMESTAMPTZ,
      NULL::TIMESTAMPTZ,
      NULL::TEXT,
      v_reserved_at;
END;
$$;

COMMENT ON FUNCTION reserve_booking_slot(UUID, UUID, TEXT, TEXT)
  IS 'Atomically reserves an internal booking slot by locking the slot row, creating the appointment, and updating slot status/count in one transaction.';
