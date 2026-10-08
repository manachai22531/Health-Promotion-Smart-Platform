BEGIN;
DROP TABLE IF EXISTS ocr_review_audit;
DROP TABLE IF EXISTS ocr_export_records;
DROP TABLE IF EXISTS ocr_setup_profiles;
DELETE FROM schema_migrations WHERE version='0180';
COMMIT;
