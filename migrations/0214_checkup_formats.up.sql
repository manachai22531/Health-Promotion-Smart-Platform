BEGIN;
CREATE TABLE IF NOT EXISTS checkup_formats(code TEXT PRIMARY KEY,name TEXT NOT NULL,print_label TEXT NOT NULL,sort_order INTEGER NOT NULL DEFAULT 0,active BOOLEAN NOT NULL DEFAULT true,revision INTEGER NOT NULL DEFAULT 1,updated_by TEXT NOT NULL DEFAULT '',updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
INSERT INTO checkup_formats(code,name,print_label,sort_order) VALUES('ANNUAL','ตรวจสุขภาพประจำปี','ตรวจสุขภาพประจำปี',1),('PRE_EMP','ตรวจสุขภาพก่อนเริ่มงาน','ตรวจสุขภาพก่อนเริ่มงาน',2),('RISK','ตรวจตามความเสี่ยง','ตรวจตามความเสี่ยง',3),('GENERAL','ตรวจสุขภาพทั่วไป','ตรวจสุขภาพทั่วไป',4) ON CONFLICT(code) DO NOTHING;
INSERT INTO schema_migrations(version,description) VALUES('0214','Configurable health check formats and saved print snapshots') ON CONFLICT(version) DO NOTHING;
COMMIT;
