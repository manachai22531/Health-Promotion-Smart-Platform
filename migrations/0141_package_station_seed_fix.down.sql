BEGIN;
DELETE FROM schema_migrations WHERE version='0141';
-- Station master data is intentionally preserved on rollback to avoid deleting user configuration.
COMMIT;
