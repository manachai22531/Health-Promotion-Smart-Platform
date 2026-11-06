# v7.65.28 Production

Fix Update Center preflight rejecting 0222_hr_direct_access.up.sql as nontransactional when upgrading from v7.65.25. Both 0221_hr_connect.up.sql and 0222_hr_direct_access.up.sql now have BEGIN/COMMIT wrappers, covering direct upgrades from older releases as well. The idempotent DDL and existing HR data remain unchanged.

Reuse the actual Update Center migration validator in package builds for all migrations numbered 0221 and newer, so missing transaction wrappers or unsupported psql meta-commands stop packaging. Runtime schema initialization remains separate and unchanged; installer and in-app update SQL files are transactional.

Includes all previous automatic Customer/HR server links, passwordless scoped HR access, removed Customer Public URL setting, Location preferences and installer fixes. Use this package instead of v7.65.26/27 for in-app updates. A failed preflight keeps the existing Production server running.

Validation: actual updater validator acceptance/rejection tests; isolated PostgreSQL upgrade of the v7.65.25 HR schema, repeated application preserving accounts/employees/grants and deliberate mid-DDL failure rolling back all new columns; HR/customer regressions, build/release tests and final ZIP manifest validation. Actual Windows GUI/UAC and on-site Update Center execution still require target validation.
