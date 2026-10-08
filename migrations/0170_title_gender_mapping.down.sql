BEGIN;
DROP INDEX IF EXISTS title_master_kind_gender_idx;
ALTER TABLE title_master DROP CONSTRAINT IF EXISTS title_master_gender_check;
ALTER TABLE title_master DROP COLUMN IF EXISTS gender;
DELETE FROM schema_migrations WHERE version='0170';
COMMIT;
