BEGIN;
DELETE FROM schema_migrations WHERE version='0140';
DROP INDEX IF EXISTS package_item_station_station_idx;
DROP TABLE IF EXISTS package_item_station_assignments;
DROP TABLE IF EXISTS item_type_station_mapping;
DROP INDEX IF EXISTS station_master_active_sort_idx;
DROP INDEX IF EXISTS station_master_code_unique_idx;
DROP TABLE IF EXISTS station_master;
COMMIT;
