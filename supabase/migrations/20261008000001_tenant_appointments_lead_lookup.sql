-- Dedup lookup index for appointment-lead upserts.
--
-- WHY: `upsertAppointmentLead` (src/lib/booking/lead-dedup.ts) matches an
-- existing active LEAD by (tenant_id, status, client_phone) before inserting.
-- Without a composite index this lookup scans the tenant's full appointment
-- history on every widget message that carries a phone number.
--
-- Idempotent: uses IF NOT EXISTS so re-running the migration is safe.

CREATE INDEX IF NOT EXISTS idx_tenant_appointments_lead_lookup
  ON tenant_appointments(tenant_id, status, client_phone);
