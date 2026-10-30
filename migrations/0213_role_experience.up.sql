BEGIN;
CREATE TABLE IF NOT EXISTS user_experience_work_claims(activity TEXT NOT NULL,entity_key TEXT NOT NULL,completed_by TEXT NOT NULL DEFAULT '',created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY(activity,entity_key));
CREATE TABLE IF NOT EXISTS role_experience_policies(role_id TEXT PRIMARY KEY,config JSONB NOT NULL,revision INTEGER NOT NULL DEFAULT 1,updated_by TEXT NOT NULL DEFAULT '',updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS user_experience_activity_events(
 activity TEXT NOT NULL,entity_key TEXT NOT NULL,work_key TEXT NOT NULL,user_id TEXT NOT NULL,role_id TEXT NOT NULL DEFAULT '',exp INTEGER NOT NULL CHECK(exp BETWEEN 1 AND 1000),policy_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),revoked_at TIMESTAMPTZ,revoked_reason TEXT NOT NULL DEFAULT '',PRIMARY KEY(activity,entity_key));
CREATE INDEX IF NOT EXISTS user_experience_activity_user_idx ON user_experience_activity_events(user_id,created_at);
CREATE INDEX IF NOT EXISTS user_experience_activity_work_idx ON user_experience_activity_events(work_key);
CREATE TABLE IF NOT EXISTS user_experience_history(id BIGSERIAL PRIMARY KEY,activity TEXT NOT NULL,entity_key TEXT NOT NULL,user_id TEXT NOT NULL,actor_id TEXT NOT NULL,action TEXT NOT NULL,exp_delta INTEGER NOT NULL,details JSONB NOT NULL DEFAULT '{}'::jsonb,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
INSERT INTO user_experience_activity_events(activity,entity_key,work_key,user_id,exp,created_at,policy_snapshot) SELECT 'CONFIRM_CASE',record_key,record_key,user_id,exp,created_at,'{"legacy":true}'::jsonb FROM user_experience_events ON CONFLICT(activity,entity_key) DO NOTHING;
INSERT INTO user_experience_work_claims(activity,entity_key,completed_by,created_at) SELECT activity,entity_key,user_id,created_at FROM user_experience_activity_events ON CONFLICT(activity,entity_key) DO NOTHING;
INSERT INTO schema_migrations(version,description) VALUES('0213','Role-based work EXP with idempotent award/revocation history') ON CONFLICT(version) DO NOTHING;
COMMIT;
