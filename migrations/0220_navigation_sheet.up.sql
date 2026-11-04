BEGIN;
CREATE TABLE IF NOT EXISTS customer_navigation_sheets(membership_id TEXT PRIMARY KEY REFERENCES company_customers(id) ON DELETE CASCADE,data JSONB NOT NULL DEFAULT '{}'::jsonb,revision BIGINT NOT NULL DEFAULT 1,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_by TEXT NOT NULL);
INSERT INTO schema_migrations(version,description) VALUES('0220','Editable navigation sheets with per-case revision and audit') ON CONFLICT(version) DO NOTHING;
COMMIT;
