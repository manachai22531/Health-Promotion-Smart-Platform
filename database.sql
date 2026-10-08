CREATE DATABASE health_check_smart_search;

-- เชื่อมต่อฐานข้อมูล health_check_smart_search ก่อนรันคำสั่งด้านล่าง
CREATE TABLE IF NOT EXISTS app_state (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  revision BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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

CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS patient_api_config (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK(id=1),endpoint_url TEXT NOT NULL,api_key TEXT NOT NULL DEFAULT '',updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_by TEXT NOT NULL DEFAULT 'system'
);

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

CREATE TABLE IF NOT EXISTS package_api_config_log (
  id BIGSERIAL PRIMARY KEY,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  changed_by TEXT NOT NULL,
  old_endpoint_url TEXT NOT NULL,
  new_endpoint_url TEXT NOT NULL,
  changed_fields JSONB NOT NULL DEFAULT '[]'::jsonb
);

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


-- v7.58 Checkup Workflow Phase 1 (Server จะสร้างให้อัตโนมัติด้วยเมื่อเริ่มโปรแกรม)
CREATE TABLE IF NOT EXISTS checkup_projects (
  id TEXT PRIMARY KEY, project_code TEXT NOT NULL DEFAULT '', project_name TEXT NOT NULL,
  company_id TEXT NOT NULL DEFAULT '', company_name TEXT NOT NULL DEFAULT '', screening_year TEXT NOT NULL DEFAULT '',
  start_date DATE, end_date DATE, location TEXT NOT NULL DEFAULT '', default_package_code TEXT NOT NULL DEFAULT '',
  default_package_name TEXT NOT NULL DEFAULT '', default_location_code TEXT NOT NULL DEFAULT '', billing_type TEXT NOT NULL DEFAULT '', contact_person TEXT NOT NULL DEFAULT '',
  remark TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'DRAFT', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), created_by TEXT NOT NULL DEFAULT 'system', updated_by TEXT NOT NULL DEFAULT 'system'
);
CREATE TABLE IF NOT EXISTS checkup_bookings (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES checkup_projects(id) ON DELETE CASCADE, record_key TEXT NOT NULL DEFAULT '',
  hn TEXT NOT NULL DEFAULT '', employee_code TEXT NOT NULL DEFAULT '', patient_name TEXT NOT NULL DEFAULT '', id_passport TEXT NOT NULL DEFAULT '',
  birth_date TEXT NOT NULL DEFAULT '', sex TEXT NOT NULL DEFAULT '', company_id TEXT NOT NULL DEFAULT '', company_name TEXT NOT NULL DEFAULT '',
  department_name TEXT NOT NULL DEFAULT '', position_name TEXT NOT NULL DEFAULT '', package_code TEXT NOT NULL DEFAULT '', package_name TEXT NOT NULL DEFAULT '',
  scheduled_date DATE, booking_status TEXT NOT NULL DEFAULT 'BOOKED', remark TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), created_by TEXT NOT NULL DEFAULT 'system', updated_by TEXT NOT NULL DEFAULT 'system'
);
CREATE UNIQUE INDEX IF NOT EXISTS checkup_bookings_project_record_unique_idx ON checkup_bookings(project_id,record_key) WHERE record_key <> '';
CREATE TABLE IF NOT EXISTS checkup_visits (
  id TEXT PRIMARY KEY, booking_id TEXT NOT NULL UNIQUE REFERENCES checkup_bookings(id) ON DELETE CASCADE, visit_date DATE NOT NULL DEFAULT CURRENT_DATE,
  checkin_at TIMESTAMPTZ, vn TEXT NOT NULL DEFAULT '', location TEXT NOT NULL DEFAULT '', doctor_name TEXT NOT NULL DEFAULT '',
  visit_status TEXT NOT NULL DEFAULT 'NOT_ARRIVED', result_status TEXT NOT NULL DEFAULT 'WAITING_RESULT', order_total INTEGER NOT NULL DEFAULT 0,
  order_complete INTEGER NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_by TEXT NOT NULL DEFAULT 'system'
);
CREATE TABLE IF NOT EXISTS checkup_workflow_audit (
  id BIGSERIAL PRIMARY KEY, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, action TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb, performed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), performed_by TEXT NOT NULL DEFAULT 'system', client_address TEXT NOT NULL DEFAULT ''
);


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
