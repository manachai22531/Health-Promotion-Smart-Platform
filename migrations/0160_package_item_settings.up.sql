BEGIN;

ALTER TABLE package_item_station_assignments
  ADD COLUMN IF NOT EXISTS item_type TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS package_item_station_type_idx
  ON package_item_station_assignments(LOWER(item_type), package_id);

INSERT INTO schema_migrations(version,description,applied_at)
VALUES('0160','Persist package item type + station in one relational batch transaction',NOW())
ON CONFLICT DO NOTHING;

COMMIT;
