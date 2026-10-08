BEGIN;

ALTER TABLE his_packages
  ADD COLUMN IF NOT EXISTS his_presence TEXT NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN IF NOT EXISTS his_status TEXT NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS last_checked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_found_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS check_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS not_found_streak INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_check_error TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS last_check_reason TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS last_known_his_status TEXT NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN IF NOT EXISTS last_status_response JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS his_packages_presence_idx
  ON his_packages(his_presence, verification_status, updated_at DESC);
CREATE INDEX IF NOT EXISTS his_packages_status_idx
  ON his_packages(his_status, verification_status, updated_at DESC);

CREATE TABLE IF NOT EXISTS his_package_verification_log (
  id BIGSERIAL PRIMARY KEY,
  package_id BIGINT REFERENCES his_packages(id) ON DELETE CASCADE,
  package_code TEXT NOT NULL,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  his_presence TEXT NOT NULL DEFAULT 'UNKNOWN',
  his_status TEXT NOT NULL DEFAULT 'UNKNOWN',
  verification_status TEXT NOT NULL DEFAULT 'PENDING',
  reason TEXT NOT NULL DEFAULT '',
  error TEXT NOT NULL DEFAULT '',
  response_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  checked_by TEXT NOT NULL DEFAULT 'system'
);
CREATE INDEX IF NOT EXISTS his_package_verification_log_code_idx
  ON his_package_verification_log(LOWER(package_code), checked_at DESC);

INSERT INTO schema_migrations(version,description)
VALUES ('0120','Package HIS batch reconciliation / active-inactive verification')
ON CONFLICT(version) DO NOTHING;

COMMIT;
