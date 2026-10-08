BEGIN;
ALTER TABLE title_master ADD COLUMN IF NOT EXISTS gender TEXT NOT NULL DEFAULT '';
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='title_master_gender_check') THEN ALTER TABLE title_master ADD CONSTRAINT title_master_gender_check CHECK(gender IN ('','M','F')); END IF; END $$;
CREATE INDEX IF NOT EXISTS title_master_kind_gender_idx ON title_master(kind,gender);
INSERT INTO schema_migrations(version,description,applied_at) VALUES('0170','Title / TitleEN gender mapping',NOW()) ON CONFLICT(version) DO UPDATE SET description=EXCLUDED.description,applied_at=NOW();
COMMIT;
