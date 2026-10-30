BEGIN;
DROP TABLE IF EXISTS his_operation_guards;
DROP TABLE IF EXISTS clinical_case_controls;
DELETE FROM schema_migrations WHERE version='0216';
COMMIT;
