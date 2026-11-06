# v7.65.25 Production

HR Connect is integrated into the existing company/year/Booking board. Each year has a compact progress strip, HR filter and detail drawer with employee status, audit history and HR accounts. Staff permissions reuse companyView, customerImport and companyEdit.

New HTTPS-ready /hr-connect portal: one-use HR invitations, salted scrypt passwords, persistent HttpOnly sessions, per-company/year grants and password reset; Excel/CSV imports with atomic validation and duplicate checks; manual single-record editing; individual expiring employee links plus verification codes; employee return, HR review/send, hospital accept/return and compatible Excel export for the existing customer importer. HR staging does not create clinical cases, Visits or HIS Orders. Credentials/link delivery are manual; no automatic outbound email. External DNS/TLS/reverse proxy must be configured by the organization; see HR-CONNECT-DEPLOYMENT.md and the allowlist proxy example.

Station 7 now lists every Location regardless of master active/inactive. Only the separate “แสดงในใบนำทาง” preference controls visibility; new unconfigured Locations are not implicitly selected. Inactive master Locations can be mapped, tested, saved and shown without changing their master state.

Includes all prior navigation/PDF, offline customer/employee template, performance, checksum backup and bounded installer startup fixes. Migration 0221 is idempotent and included in both installer and server schema initialization.

Validation: real isolated PostgreSQL end-to-end authorization, import, link verification, conflict/rollback, send/accept/export, revocation tests; actual browser+database HR/staff/employee workflow; navigation Location regressions, build and release tests. Windows GUI/UAC, physical printers, live HIS and organization external HTTPS infrastructure are not exercised in cloud.
