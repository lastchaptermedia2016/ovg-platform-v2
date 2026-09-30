-- Migration: extend_action_logs
ALTER TABLE IF EXISTS action_logs
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;