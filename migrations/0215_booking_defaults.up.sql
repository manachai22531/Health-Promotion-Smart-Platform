BEGIN;
ALTER TABLE IF EXISTS checkup_projects ADD COLUMN IF NOT EXISTS booking_defaults JSONB NOT NULL DEFAULT '{}'::jsonb;
INSERT INTO schema_migrations(version,description) VALUES('0215','Editable company-year booking package and payer snapshots') ON CONFLICT(version) DO NOTHING;
COMMIT;
