BEGIN;
CREATE TABLE IF NOT EXISTS user_experience_events(
  record_key TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  exp INTEGER NOT NULL DEFAULT 10 CHECK(exp=10),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS user_experience_events_user_date_idx ON user_experience_events(user_id,created_at);
INSERT INTO schema_migrations(version,description) VALUES('0212','User experience ledger: one reward per confirmed case') ON CONFLICT(version) DO NOTHING;
COMMIT;
