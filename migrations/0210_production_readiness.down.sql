BEGIN;
DROP TABLE IF EXISTS production_readiness_uat;
DELETE FROM schema_migrations WHERE version='0210';
COMMIT;
