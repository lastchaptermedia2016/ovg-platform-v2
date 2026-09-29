-- Migration: create_tenant_voice_sessions
-- Created at: 2026-09-23
-- Purpose: Log web voice agent STT sessions, latency, transcripts, and fallback outcomes.

CREATE TABLE IF NOT EXISTS tenant_voice_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  audio_duration_ms INTEGER,
  stt_provider TEXT NOT NULL DEFAULT 'whisper'
    CHECK (stt_provider IN ('whisper', 'web-speech')),
  transcript TEXT,
  latency_ms INTEGER NOT NULL
    CHECK (latency_ms >= 0),
  status TEXT NOT NULL DEFAULT 'completed'
    CHECK (status IN ('completed', 'fallback', 'failed')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tenant_voice_sessions_tenant_created
  ON tenant_voice_sessions(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tenant_voice_sessions_session
  ON tenant_voice_sessions(session_id);

ALTER TABLE tenant_voice_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_read_own_tenant_voice_sessions" ON tenant_voice_sessions;

CREATE POLICY "users_read_own_tenant_voice_sessions" ON tenant_voice_sessions
  FOR SELECT
  USING (
    tenant_id IN (
      SELECT t.id FROM tenants t
      JOIN user_resellers ur ON ur.reseller_id = t.reseller_id
      WHERE ur.user_id = auth.uid()
    )
  );

COMMENT ON TABLE tenant_voice_sessions IS 'Per-tenant web voice STT sessions (transcript, latency, status) for analytics and audit.';
COMMENT ON COLUMN tenant_voice_sessions.id IS 'Primary key (UUID v4).';
COMMENT ON COLUMN tenant_voice_sessions.tenant_id IS 'Tenant the session belongs to (FK -> tenants.id). Never null.';
COMMENT ON COLUMN tenant_voice_sessions.session_id IS 'Server-generated correlation id for the STT session.';
COMMENT ON COLUMN tenant_voice_sessions.audio_duration_ms IS 'Estimated clip duration in milliseconds; NULL if missing/unparseable.';
COMMENT ON COLUMN tenant_voice_sessions.stt_provider IS 'Speech-to-text engine that produced the transcript (whisper | web-speech).';
COMMENT ON COLUMN tenant_voice_sessions.transcript IS 'Final transcript text; NULL when the session failed.';
COMMENT ON COLUMN tenant_voice_sessions.latency_ms IS 'Measured STT provider round-trip latency in milliseconds.';
COMMENT ON COLUMN tenant_voice_sessions.status IS 'Session outcome (completed | fallback | failed).';
COMMENT ON COLUMN tenant_voice_sessions.created_at IS 'Immutable creation timestamp (UTC).';
