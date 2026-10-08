BEGIN;
CREATE TABLE IF NOT EXISTS production_readiness_uat(
  check_key TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  note TEXT NOT NULL DEFAULT '',
  checked_by TEXT NOT NULL DEFAULT '',
  checked_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT production_readiness_uat_status_chk CHECK(status IN ('PENDING','PASS','FAIL','BLOCKED'))
);
CREATE INDEX IF NOT EXISTS production_readiness_uat_status_idx ON production_readiness_uat(status,updated_at DESC);
INSERT INTO schema_migrations(version,description) VALUES('0210','Production Readiness Pack: UAT, load test, backup/rollback validation, security and database maintenance') ON CONFLICT(version) DO NOTHING;
COMMIT;
