BEGIN;
DROP INDEX IF EXISTS package_item_station_type_idx;
ALTER TABLE package_item_station_assignments DROP COLUMN IF EXISTS item_type;
DELETE FROM schema_migrations WHERE version='0160';
COMMIT;
