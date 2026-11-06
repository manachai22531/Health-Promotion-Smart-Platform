BEGIN;
ALTER TABLE hr_accounts ADD COLUMN IF NOT EXISTS auth_revision INTEGER NOT NULL DEFAULT 1;
ALTER TABLE hr_invites ADD COLUMN IF NOT EXISTS code_hash TEXT NOT NULL DEFAULT '';
ALTER TABLE hr_sessions ADD COLUMN IF NOT EXISTS auth_revision INTEGER NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS hr_employee_credentials(employee_id UUID PRIMARY KEY REFERENCES hr_employees(id),password_hash TEXT NOT NULL,auth_revision INTEGER NOT NULL DEFAULT 1,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
UPDATE hr_invites SET used_at=NOW() WHERE used_at IS NULL AND (kind='DIRECT' OR code_hash='');
DELETE FROM hr_sessions WHERE auth_revision=0 OR invite_hash<>'';
COMMIT;
