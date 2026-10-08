BEGIN;
DELETE FROM schema_migrations WHERE version='0150';
-- Keep system_health_events intentionally for operational history / rollback safety.
COMMIT;
