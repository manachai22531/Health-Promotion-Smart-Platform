BEGIN;
CREATE TABLE IF NOT EXISTS customer_access_settings(id INTEGER PRIMARY KEY CHECK(id=1),signing_key TEXT NOT NULL,base_url TEXT NOT NULL DEFAULT '');CREATE TABLE IF NOT EXISTS customer_access_grants(id UUID PRIMARY KEY,record_key TEXT NOT NULL,binding TEXT NOT NULL,expires_at TIMESTAMPTZ NOT NULL,revoked_at TIMESTAMPTZ,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),UNIQUE(record_key,binding));
INSERT INTO schema_migrations(version,description) VALUES('0217','Scoped customer package QR grants') ON CONFLICT(version) DO NOTHING;
COMMIT;
