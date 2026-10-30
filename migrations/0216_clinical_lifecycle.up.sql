BEGIN;
CREATE TABLE IF NOT EXISTS clinical_case_controls(record_key TEXT PRIMARY KEY,data JSONB NOT NULL DEFAULT '{}'::jsonb,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS his_operation_guards(record_key TEXT PRIMARY KEY,operation_id TEXT NOT NULL,operation TEXT NOT NULL,status TEXT NOT NULL,stage TEXT NOT NULL DEFAULT 'PREPARED',payload JSONB,response JSONB,started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),finished_at TIMESTAMPTZ);
INSERT INTO schema_migrations(version,description) VALUES('0216','Clinical retrospective controls and durable HIS operation guards') ON CONFLICT(version) DO NOTHING;
COMMIT;
