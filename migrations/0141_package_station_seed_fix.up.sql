BEGIN;
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
SELECT x.item_type,s.id,'MIGRATION_0141' FROM (VALUES
 ('LAB','LAB'),('Xray','XRAY'),('X-Ray','XRAY'),('BME','EKG'),('DoctorFee','DOCTOR'),('Doctor','DOCTOR'),('Vital signs','VITAL'),('Physical','PHYSICAL'),('Physical Exam','PHYSICAL')
) AS x(item_type,station_code)
JOIN station_master s ON UPPER(s.code)=UPPER(x.station_code)
ON CONFLICT(item_type) DO NOTHING;

INSERT INTO schema_migrations(version,description,applied_at)
VALUES('0141','Repair Station Master seed and package detail Type/Station editor support',NOW())
ON CONFLICT DO NOTHING;
COMMIT;
