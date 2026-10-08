BEGIN;
-- Rollback is intentionally non-destructive for customer columns. It removes only objects introduced solely by 0110.
DROP INDEX IF EXISTS customers_full_name_trgm_idx;
DROP INDEX IF EXISTS customers_last_name_trgm_idx;
DROP INDEX IF EXISTS customers_first_name_trgm_idx;
DROP INDEX IF EXISTS customers_passport_idx;
DROP INDEX IF EXISTS customers_identification_idx;
DROP INDEX IF EXISTS customers_vn_idx;
DROP INDEX IF EXISTS customers_hn_idx;
DROP INDEX IF EXISTS company_customers_company_year_idx;
DROP INDEX IF EXISTS checkup_bookings_project_status_idx;
DROP INDEX IF EXISTS checkup_visits_date_status_idx;
DROP INDEX IF EXISTS checkup_visits_vn_idx;
DELETE FROM schema_migrations WHERE version='0110';
COMMIT;
