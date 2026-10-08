BEGIN;
CREATE TABLE IF NOT EXISTS ocr_setup_profiles (
  profile_key TEXT PRIMARY KEY,
  setup_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS ocr_export_records (
  id BIGSERIAL PRIMARY KEY,
  record_key TEXT NOT NULL UNIQUE,
  hn TEXT NOT NULL DEFAULT '',
  patient_name TEXT NOT NULL DEFAULT '',
  company_name TEXT NOT NULL DEFAULT '',
  document_type TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'READY',
  source_file_name TEXT NOT NULL DEFAULT '',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ocr_export_records_hn_idx ON ocr_export_records(hn);
CREATE INDEX IF NOT EXISTS ocr_export_records_document_idx ON ocr_export_records(document_type,updated_at DESC);
CREATE TABLE IF NOT EXISTS ocr_review_audit (
  id BIGSERIAL PRIMARY KEY,
  action TEXT NOT NULL,
  actor TEXT NOT NULL DEFAULT '',
  record_key TEXT NOT NULL DEFAULT '',
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ocr_review_audit_created_idx ON ocr_review_audit(created_at DESC);
INSERT INTO schema_migrations(version,description,applied_at) VALUES('0180','OCR review setup, export queue and audit tables',NOW()) ON CONFLICT(version) DO UPDATE SET description=EXCLUDED.description,applied_at=NOW();
COMMIT;
