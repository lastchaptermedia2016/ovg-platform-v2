-- Migration: extend_action_logs
ALTER TABLE action_logs
  ADD COLUMN IF NOT EXISTS success BOOLEAN,
  ADD COLUMN IF NOT EXISTS duration_ms NUMERIC(10,2);
