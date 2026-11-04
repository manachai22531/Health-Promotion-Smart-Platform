BEGIN;
CREATE TABLE IF NOT EXISTS his_operation_attempts(operation_id TEXT PRIMARY KEY,record_key TEXT NOT NULL,operation TEXT NOT NULL,request_data JSONB NOT NULL DEFAULT '{}'::jsonb,status TEXT NOT NULL DEFAULT 'RUNNING',stage TEXT NOT NULL DEFAULT 'PREPARED',started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),finished_at TIMESTAMPTZ);CREATE INDEX IF NOT EXISTS his_operation_attempts_case_idx ON his_operation_attempts(record_key,started_at DESC);
INSERT INTO schema_migrations(version,description) VALUES('0219','Repair durable HIS operation attempt history') ON CONFLICT(version) DO NOTHING;
COMMIT;
