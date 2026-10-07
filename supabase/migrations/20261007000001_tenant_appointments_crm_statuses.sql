-- Add CRM workflow statuses to tenant_appointments.
--
-- WHY: The Appointment Requests dashboard needs two additional status values
-- for the client to track their sales workflow:
--   CONTACTED  — a team member has reached out to the lead
--   ARCHIVED   — the lead is dismissed / no longer actionable
--
-- These are additive only and do not touch any existing rows.

ALTER TABLE tenant_appointments
  DROP CONSTRAINT IF EXISTS tenant_appointments_status_check;

ALTER TABLE tenant_appointments
  ADD CONSTRAINT tenant_appointments_status_check
  CHECK (status = ANY (ARRAY[
    'AVAILABLE'::text,
    'RESERVED'::text,
    'CONFIRMED'::text,
    'LEAD'::text,
    'CONTACTED'::text,
    'ARCHIVED'::text
  ]));

COMMENT ON COLUMN tenant_appointments.status IS
  'AVAILABLE = open bookable slot; RESERVED = slot held; CONFIRMED = booked;
   LEAD = anonymous chat capture (name+phone, no slot);
   CONTACTED = team member has reached out;
   ARCHIVED = lead dismissed.';
