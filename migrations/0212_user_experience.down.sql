BEGIN;
DROP TABLE IF EXISTS user_experience_events;
DELETE FROM schema_migrations WHERE version='0212';
COMMIT;
