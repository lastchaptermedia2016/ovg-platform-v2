-- Add a distinct LEAD status to tenant_appointments so anonymous chat booking
-- *captures* (name + phone lead, no real time slot held yet) are unambiguous
-- from actual reserved slots (status = 'RESERVED', set later by the deferred
-- booking_slots / reserve_booking_slot phase).
--
-- WHY extend the CHECK rather than reuse AVAILABLE:
--   The deferred booking bridge uses booking_slots where AVAILABLE means "an open,
--   bookable slot". Reusing AVAILABLE here would mislead any future query that
--   reads tenant_appointments.status into thinking a lead row is a free slot.
--   LEAD is self-documenting and collides with nothing: the only writer of
--   tenant_appointments.status is process-command (anon lead capture), and no app
--   code reads the column — so adding a 4th enum value is non-destructive.
--
-- Live CHECK before this migration (verified):
--   CHECK ((status = ANY (ARRAY['AVAILABLE'::text, 'RESERVED'::text, 'CONFIRMED'::text])))

ALTER TABLE tenant_appointments
  DROP CONSTRAINT IF EXISTS tenant_appointments_status_check;

ALTER TABLE tenant_appointments
  ADD CONSTRAINT tenant_appointments_status_check
  CHECK (status = ANY (ARRAY['AVAILABLE'::text, 'RESERVED'::text, 'CONFIRMED'::text, 'LEAD'::text]));

COMMENT ON COLUMN tenant_appointments.status IS
  'AVAILABLE = open bookable slot; RESERVED = slot held; CONFIRMED = booked; LEAD = anonymous chat capture (name+phone, no slot).';
