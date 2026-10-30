BEGIN;
-- Keep the legacy ledger for old releases.
DROP TABLE IF EXISTS user_experience_history;
DROP TABLE IF EXISTS user_experience_activity_events;
DROP TABLE IF EXISTS user_experience_work_claims;
DROP TABLE IF EXISTS role_experience_policies;
DELETE FROM schema_migrations WHERE version='0213';
COMMIT;
