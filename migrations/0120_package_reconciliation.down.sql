BEGIN;
DROP TABLE IF EXISTS his_package_verification_log;
DROP INDEX IF EXISTS his_packages_presence_idx;
DROP INDEX IF EXISTS his_packages_status_idx;
ALTER TABLE his_packages
  DROP COLUMN IF EXISTS last_status_response,
  DROP COLUMN IF EXISTS last_known_his_status,
  DROP COLUMN IF EXISTS last_check_reason,
  DROP COLUMN IF EXISTS last_check_error,
  DROP COLUMN IF EXISTS not_found_streak,
  DROP COLUMN IF EXISTS check_attempts,
  DROP COLUMN IF EXISTS last_found_at,
  DROP COLUMN IF EXISTS last_checked_at,
  DROP COLUMN IF EXISTS verification_status,
  DROP COLUMN IF EXISTS his_status,
  DROP COLUMN IF EXISTS his_presence;
DELETE FROM schema_migrations WHERE version='0120';
COMMIT;
