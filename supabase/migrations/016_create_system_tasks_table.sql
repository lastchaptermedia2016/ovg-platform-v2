-- System task queue for headless infrastructure commands
-- (build, CRM sync, asset reload). Critical commands are inserted here by
-- the command dispatcher and processed asynchronously by the orchestrator worker.

CREATE TABLE IF NOT EXISTS system_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The SYSTEM_COMMAND that was requested (e.g. SYSTEM_EXECUTE_BUILD)
  command TEXT NOT NULL,

  -- Opaque payload passed through to the orchestrator handler
  payload JSONB,

  -- Lifecycle: PENDING -> PROCESSING -> COMPLETED | FAILED
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),

  -- Captured error detail when status = FAILED
  error_log TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Worker pulls PENDING rows ordered oldest-first
CREATE INDEX idx_system_tasks_status_created
  ON system_tasks (status, created_at ASC);

-- Enable Row-Level Security. This table is system-level and only ever
-- touched by the service role (dispatcher insert + worker updates).
ALTER TABLE system_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages system_tasks"
  ON system_tasks
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE system_tasks IS 'Queue of headless infrastructure tasks processed asynchronously by the orchestrator worker';
COMMENT ON COLUMN system_tasks.command IS 'SYSTEM_COMMAND requested (e.g. SYSTEM_EXECUTE_BUILD)';
COMMENT ON COLUMN system_tasks.payload IS 'Opaque payload forwarded to the orchestrator handler';
COMMENT ON COLUMN system_tasks.status IS 'Lifecycle: PENDING, PROCESSING, COMPLETED, FAILED';
COMMENT ON COLUMN system_tasks.error_log IS 'Error detail captured when the task FAILED';
