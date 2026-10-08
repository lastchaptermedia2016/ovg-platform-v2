-- Add lead-capture columns to tenant_appointments.
--
-- WHY: The public widget chat pipeline needs to persist anonymous visitor
-- contact details captured during a booking-intake conversation. The existing
-- `client_name` / `client_phone` columns are tied to the slot-booking flow
-- (start_time/end_time are NOT NULL), so a lead capture that has no slot yet
-- needs its own nullable name/phone pair plus an `initial_intent` field that
-- records the visitor's original booking request verbatim.
--
-- Idempotent: uses IF NOT EXISTS so re-running the migration is safe.

ALTER TABLE tenant_appointments
  ADD COLUMN IF NOT EXISTS visitor_name  text NULL,
  ADD COLUMN IF NOT EXISTS visitor_phone text NULL,
  ADD COLUMN IF NOT EXISTS initial_intent text NULL;

COMMENT ON COLUMN tenant_appointments.visitor_name IS
  'Visitor display name captured during a booking-intake conversation; NULL for slot-booking rows.';

COMMENT ON COLUMN tenant_appointments.visitor_phone IS
  'E.164-ish visitor phone captured during a booking-intake conversation; NULL for slot-booking rows.';

COMMENT ON COLUMN tenant_appointments.initial_intent IS
  'Verbatim copy of the visitor''s original booking request (e.g. "book a massage on Friday").';