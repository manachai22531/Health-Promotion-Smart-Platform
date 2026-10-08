# v7.62.76 Production Installer DB Migration Admin Fix

Problem observed: Production installer stopped during schema initialization after emitting successful SQL output such as CREATE TABLE / DELETE 0. Older Production databases can contain public objects owned by legacy roles. Even after grants, DDL executed by the application role can fail on ownership-sensitive ALTER/INDEX operations.

Changes:
- Installer keeps a verified postgres administrator credential in memory only for schema/migration work.
- schema-bootstrap.sql and migrations 0110/0120/0140/0141/0150/0160 run through the native psql wrapper as postgres when the verified admin credential is available.
- Runtime .env continues to use the application database role; postgres credentials are not written to application config.
- After migrations, privileges/default privileges are granted back to the application role.
- Native psql success/failure still depends only on process ExitCode, not NOTICE/WARNING stderr text.
- Existing source/database backups remain mandatory before Production deployment.
