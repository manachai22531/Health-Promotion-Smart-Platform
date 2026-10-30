BEGIN;
ALTER TABLE IF EXISTS checkup_projects DROP COLUMN IF EXISTS booking_defaults;
DELETE FROM schema_migrations WHERE version='0215';
COMMIT;
