BEGIN;
DROP TABLE IF EXISTS checkup_formats;
DELETE FROM schema_migrations WHERE version='0214';
COMMIT;
