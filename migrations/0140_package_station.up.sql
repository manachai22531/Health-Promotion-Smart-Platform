BEGIN;

CREATE TABLE IF NOT EXISTS station_master (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS station_master_code_unique_idx ON station_master(LOWER(code));
CREATE INDEX IF NOT EXISTS station_master_active_sort_idx ON station_master(active,sort_order,id);

CREATE TABLE IF NOT EXISTS item_type_station_mapping (
  item_type TEXT PRIMARY KEY,
  station_id BIGINT REFERENCES station_master(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT NOT NULL DEFAULT 'system'
);

CREATE TABLE IF NOT EXISTS package_item_station_assignments (
  package_id BIGINT NOT NULL REFERENCES his_packages(id) ON DELETE CASCADE,
  item_key TEXT NOT NULL,
  item_code TEXT NOT NULL DEFAULT '',
  item_name TEXT NOT NULL DEFAULT '',
  station_id BIGINT REFERENCES station_master(id) ON DELETE SET NULL,
  assignment_source TEXT NOT NULL DEFAULT 'MANUAL' CHECK(assignment_source IN ('AUTO','MANUAL')),
  updated_by TEXT NOT NULL DEFAULT 'system',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(package_id,item_key)
);
CREATE INDEX IF NOT EXISTS package_item_station_station_idx ON package_item_station_assignments(station_id,package_id);

INSERT INTO station_master(code,name,active,sort_order) VALUES
 ('LAB','ห้องเจาะเลือด / LAB',TRUE,10),
 ('XRAY','X-Ray',TRUE,20),
 ('EKG','EKG',TRUE,30),
 ('VITAL','Vital Sign',TRUE,40),
 ('PHYSICAL','Physical Exam',TRUE,50),
 ('DOCTOR','Doctor',TRUE,60),
 ('OTHER','อื่น ๆ',TRUE,99)
ON CONFLICT DO NOTHING;

INSERT INTO item_type_station_mapping(item_type,station_id,updated_by)
SELECT x.item_type,s.id,'MIGRATION_0140' FROM (VALUES
 ('LAB','LAB'),('Xray','XRAY'),('X-Ray','XRAY'),('BME','EKG'),('DoctorFee','DOCTOR'),('Doctor','DOCTOR'),('Vital signs','VITAL')
) AS x(item_type,station_code) JOIN station_master s ON UPPER(s.code)=UPPER(x.station_code)
ON CONFLICT(item_type) DO NOTHING;

INSERT INTO schema_migrations(version,description,applied_at) VALUES('0140','Package item Station Master, mapping and audited batch assignments',NOW()) ON CONFLICT DO NOTHING;
COMMIT;
