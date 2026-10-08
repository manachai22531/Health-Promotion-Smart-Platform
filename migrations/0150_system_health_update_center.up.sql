BEGIN;
CREATE TABLE IF NOT EXISTS system_health_events (
  id BIGSERIAL PRIMARY KEY,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL,
  endpoint TEXT,
  entity_key TEXT,
  duration_ms INTEGER,
  expected_rows INTEGER,
  actual_rows INTEGER,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS system_health_events_created_idx ON system_health_events(created_at DESC);
CREATE INDEX IF NOT EXISTS system_health_events_type_idx ON system_health_events(event_type,status,created_at DESC);
INSERT INTO schema_migrations(version,description)
VALUES('0150','System Health monitor and in-app update center foundation')
ON CONFLICT(version) DO NOTHING;
COMMIT;
