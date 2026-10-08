
CREATE TABLE IF NOT EXISTS app_state (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  revision BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
DELETE FROM app_state older USING app_state newer
WHERE older.id = newer.id AND (
  COALESCE(older.revision,0) < COALESCE(newer.revision,0)
  OR (COALESCE(older.revision,0) = COALESCE(newer.revision,0) AND older.ctid < newer.ctid)
);
CREATE UNIQUE INDEX IF NOT EXISTS app_state_id_unique_idx ON app_state(id);

CREATE TABLE IF NOT EXISTS app_state_import_backups (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reason TEXT NOT NULL DEFAULT 'IMPORT',
  performed_by TEXT NOT NULL DEFAULT '',
  source_revision BIGINT NOT NULL,
  import_summary JSONB NOT NULL DEFAULT '[]'::jsonb,
  data JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS app_state_import_backups_created_idx ON app_state_import_backups(created_at DESC);

CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  description TEXT NOT NULL DEFAULT '',
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
DELETE FROM schema_migrations older USING schema_migrations newer
WHERE older.version = newer.version AND older.ctid < newer.ctid;
CREATE UNIQUE INDEX IF NOT EXISTS schema_migrations_version_unique_idx ON schema_migrations(version);

CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Some legacy installations created these singleton/config tables before
-- primary keys were added. Repair duplicates and add compatible uniqueness so
-- ON CONFLICT works during an in-place upgrade.
DELETE FROM system_settings older USING system_settings newer
WHERE older.key = newer.key AND older.ctid < newer.ctid;
CREATE UNIQUE INDEX IF NOT EXISTS system_settings_key_unique_idx ON system_settings(key);

CREATE TABLE IF NOT EXISTS patient_api_config (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK(id=1),endpoint_url TEXT NOT NULL,api_key TEXT NOT NULL DEFAULT '',updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_by TEXT NOT NULL DEFAULT 'system'
);
DELETE FROM patient_api_config older USING patient_api_config newer
WHERE older.id = newer.id AND older.ctid < newer.ctid;
CREATE UNIQUE INDEX IF NOT EXISTS patient_api_config_id_unique_idx ON patient_api_config(id);

INSERT INTO system_settings(key,value) VALUES
  ('maintenance_mode','false'),('last_backup_at','') ON CONFLICT(key) DO NOTHING;

INSERT INTO app_state (id, data)
VALUES (1, '{"companies":[],"records":[],"packages":[],"packageUsageConditions":"","packageUpdatedAt":null,"roles":[],"users":[],"at":null}'::jsonb)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS package_api_config (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  endpoint_url TEXT NOT NULL,
  headers JSONB NOT NULL DEFAULT '{}'::jsonb,
  config_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT NOT NULL DEFAULT 'system'
);
DELETE FROM package_api_config older USING package_api_config newer
WHERE older.id = newer.id AND older.ctid < newer.ctid;
CREATE UNIQUE INDEX IF NOT EXISTS package_api_config_id_unique_idx ON package_api_config(id);

-- Optional tables created by previous server releases can also predate their
-- unique constraints. Repair every target used by runtime ON CONFLICT before
-- the installer starts the validation server.
DO $$ BEGIN
  IF to_regclass('public.his_api_connections') IS NOT NULL
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='his_api_connections' AND column_name='id') THEN
    DELETE FROM his_api_connections older USING his_api_connections newer
    WHERE older.id = newer.id AND older.ctid < newer.ctid;
    CREATE UNIQUE INDEX IF NOT EXISTS his_api_connections_id_unique_idx ON his_api_connections(id);
  END IF;
  IF to_regclass('public.user_guide_documents') IS NOT NULL
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='user_guide_documents' AND column_name='view_id') THEN
    DELETE FROM user_guide_documents older USING user_guide_documents newer
    WHERE older.view_id = newer.view_id AND older.ctid < newer.ctid;
    CREATE UNIQUE INDEX IF NOT EXISTS user_guide_documents_view_unique_idx ON user_guide_documents(view_id);
  END IF;
  IF to_regclass('public.company_year_documents') IS NOT NULL
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='company_year_documents' AND column_name='company_id') THEN
    DELETE FROM company_year_documents older USING company_year_documents newer
    WHERE older.company_id = newer.company_id AND older.ctid < newer.ctid;
    CREATE UNIQUE INDEX IF NOT EXISTS company_year_documents_company_unique_idx ON company_year_documents(company_id);
  END IF;
  IF to_regclass('public.checkup_visits') IS NOT NULL
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='checkup_visits' AND column_name='booking_id') THEN
    DELETE FROM checkup_visits older USING checkup_visits newer
    WHERE older.booking_id = newer.booking_id AND older.ctid < newer.ctid;
    CREATE UNIQUE INDEX IF NOT EXISTS checkup_visits_booking_unique_idx ON checkup_visits(booking_id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS package_api_config_log (
  id BIGSERIAL PRIMARY KEY,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  changed_by TEXT NOT NULL,
  old_endpoint_url TEXT NOT NULL,
  new_endpoint_url TEXT NOT NULL,
  changed_fields JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS his_payor_catalog (
  payor_code TEXT NOT NULL DEFAULT '', payor_name TEXT NOT NULL DEFAULT '',
  plan_code TEXT NOT NULL DEFAULT '', plan_name TEXT NOT NULL DEFAULT '',
  office_code TEXT NOT NULL DEFAULT '', office_name TEXT NOT NULL DEFAULT '',
  source_data JSONB NOT NULL DEFAULT '{}'::jsonb, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(payor_code,plan_code,office_code)
);
CREATE INDEX IF NOT EXISTS his_payor_catalog_payor_idx ON his_payor_catalog(LOWER(payor_code),LOWER(payor_name));
CREATE INDEX IF NOT EXISTS his_payor_catalog_plan_idx ON his_payor_catalog(LOWER(plan_code),LOWER(plan_name));
CREATE INDEX IF NOT EXISTS his_payor_catalog_office_idx ON his_payor_catalog(LOWER(office_code),LOWER(office_name));
CREATE TABLE IF NOT EXISTS his_location_settings (
  location_id TEXT PRIMARY KEY, is_active BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_by TEXT NOT NULL DEFAULT 'system'
);
ALTER TABLE his_location_settings ADD COLUMN IF NOT EXISTS location_name TEXT NOT NULL DEFAULT '';
ALTER TABLE his_location_settings ADD COLUMN IF NOT EXISTS location_code TEXT NOT NULL DEFAULT '';
ALTER TABLE his_location_settings ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';
CREATE TABLE IF NOT EXISTS nationality_master (
  code TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT '', desc1 TEXT NOT NULL DEFAULT '', desc2 TEXT NOT NULL DEFAULT '',
  display_order INTEGER NOT NULL DEFAULT 0, source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_by TEXT NOT NULL DEFAULT 'system'
);
CREATE TABLE IF NOT EXISTS title_master (
  kind TEXT NOT NULL CHECK(kind IN ('title','title_en')), code TEXT NOT NULL, name TEXT NOT NULL DEFAULT '',
  desc1 TEXT NOT NULL DEFAULT '', desc2 TEXT NOT NULL DEFAULT '', display_order INTEGER NOT NULL DEFAULT 0,
  gender TEXT NOT NULL DEFAULT '' CHECK(gender IN ('','M','F')), source_data JSONB NOT NULL DEFAULT '{}'::jsonb, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT NOT NULL DEFAULT 'system', PRIMARY KEY(kind,code)
);
CREATE INDEX IF NOT EXISTS nationality_master_name_idx ON nationality_master(LOWER(name));

CREATE TABLE IF NOT EXISTS checkup_audit_log (
  id BIGSERIAL PRIMARY KEY,
  record_key TEXT NOT NULL,
  customer_name TEXT NOT NULL DEFAULT '',
  id_passport TEXT NOT NULL DEFAULT '',
  company_id TEXT NOT NULL DEFAULT '',
  company_name TEXT NOT NULL DEFAULT '',
  company_year TEXT NOT NULL DEFAULT '',
  package_code TEXT NOT NULL DEFAULT '',
  package_name TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL CHECK (action IN ('CREATE','UPDATE')),
  performed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  performed_by_user_id TEXT NOT NULL,
  performed_by_username TEXT NOT NULL,
  performed_by_display_name TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- v7.7 จะสร้างและย้ายข้อมูลเข้าตาราง relational เพิ่มเติมโดยอัตโนมัติเมื่อ Server เริ่มทำงาน
-- app_state ยังคงเก็บไว้เป็นฐานความเข้ากันได้ระหว่างช่วง Dual-write และห้ามลบทิ้ง


-- v7.59.6 controlled package category master
CREATE TABLE IF NOT EXISTS package_categories (
  id BIGSERIAL PRIMARY KEY, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS package_subcategories (
  id BIGSERIAL PRIMARY KEY, category_id BIGINT NOT NULL REFERENCES package_categories(id) ON DELETE RESTRICT,
  name TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0, active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(category_id,name)
);

ALTER TABLE title_master ADD COLUMN IF NOT EXISTS gender TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS title_master_kind_gender_idx ON title_master(kind,gender);
