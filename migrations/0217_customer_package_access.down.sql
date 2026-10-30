BEGIN;
DROP TABLE IF EXISTS customer_access_grants;
DROP TABLE IF EXISTS customer_access_settings;
DELETE FROM schema_migrations WHERE version='0217';
COMMIT;
