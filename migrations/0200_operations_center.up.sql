BEGIN;

CREATE TABLE IF NOT EXISTS operations_jobs (
  id UUID PRIMARY KEY,
  job_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','RUNNING','SUCCESS','PARTIAL','FAILED','CANCELLED')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  result JSONB NOT NULL DEFAULT '{}'::jsonb,
  progress INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  skip_count INTEGER NOT NULL DEFAULT 0,
  fail_count INTEGER NOT NULL DEFAULT 0,
  current_item TEXT NOT NULL DEFAULT '',
  error_message TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL DEFAULT 'system',
  retry_of UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS operations_jobs_status_created_idx ON operations_jobs(status,created_at);
CREATE INDEX IF NOT EXISTS operations_jobs_updated_idx ON operations_jobs(updated_at DESC);

CREATE TABLE IF NOT EXISTS operations_job_items (
  id BIGSERIAL PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES operations_jobs(id) ON DELETE CASCADE,
  item_key TEXT NOT NULL DEFAULT '',
  record_key TEXT NOT NULL DEFAULT '',
  hn TEXT NOT NULL DEFAULT '',
  vn TEXT NOT NULL DEFAULT '',
  patient_name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','RUNNING','SUCCESS','SKIPPED','FAILED','CANCELLED')),
  message TEXT NOT NULL DEFAULT '',
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS operations_job_items_job_idx ON operations_job_items(job_id,id);
CREATE INDEX IF NOT EXISTS operations_job_items_status_idx ON operations_job_items(job_id,status,id);

CREATE TABLE IF NOT EXISTS system_action_audit (
  id BIGSERIAL PRIMARY KEY,
  request_id TEXT NOT NULL DEFAULT '',
  method TEXT NOT NULL DEFAULT '',
  route TEXT NOT NULL DEFAULT '',
  status_code INTEGER NOT NULL DEFAULT 0,
  actor TEXT NOT NULL DEFAULT '',
  client_address TEXT NOT NULL DEFAULT '',
  duration_ms INTEGER NOT NULL DEFAULT 0,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS system_action_audit_time_idx ON system_action_audit(created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS system_action_audit_actor_idx ON system_action_audit(actor,created_at DESC);
CREATE INDEX IF NOT EXISTS system_action_audit_route_idx ON system_action_audit(route,created_at DESC);

CREATE TABLE IF NOT EXISTS system_notifications (
  id BIGSERIAL PRIMARY KEY,
  severity TEXT NOT NULL DEFAULT 'INFO' CHECK (severity IN ('INFO','SUCCESS','WARNING','ERROR')),
  title TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT '',
  entity_key TEXT NOT NULL DEFAULT '',
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at TIMESTAMPTZ,
  read_by TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS system_notifications_unread_idx ON system_notifications(is_read,created_at DESC);

CREATE INDEX IF NOT EXISTS checkup_bookings_hn_idx ON checkup_bookings(hn) WHERE hn <> '';
CREATE INDEX IF NOT EXISTS checkup_bookings_record_key_idx ON checkup_bookings(record_key) WHERE record_key <> '';
CREATE INDEX IF NOT EXISTS checkup_bookings_status_updated_idx ON checkup_bookings(booking_status,updated_at DESC);
CREATE INDEX IF NOT EXISTS checkup_visits_vn_idx ON checkup_visits(vn) WHERE vn <> '';
CREATE INDEX IF NOT EXISTS checkup_visits_result_status_idx ON checkup_visits(result_status,updated_at DESC);
CREATE INDEX IF NOT EXISTS checkup_workflow_audit_time_idx ON checkup_workflow_audit(performed_at DESC,id DESC);

INSERT INTO schema_migrations(version,description)
VALUES('0200','Operations Center: jobs, notifications, action audit, production performance indexes')
ON CONFLICT(version) DO NOTHING;

COMMIT;
