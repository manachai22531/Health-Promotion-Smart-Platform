# v7.65.24 Production

Fix installer Start hanging after launcher.log reports health OK. Replace native PowerShell pipeline invocation with direct process polling without redirected pipes; log progress every five seconds, bound startup to 120 seconds, and report launcher failure clearly. The exact-version Production and PostgreSQL readiness checks remain mandatory before Complete SUCCESS. A timeout terminates only the launcher, never its server process tree.

Includes all v7.65.23 features and prior deployment checksum/backup protections. Regression tests exercise a launcher exiting while a descendant holds inherited output open, nonzero exits, and startup timeout. Windows GUI/UAC still requires target validation.
