# v7.65.20 — Windows installer copy fix

Includes all v7.65.19 navigation/PDF, HN QR, grouped Assessment, Location/Room, medication/vaccine and earlier performance changes.

The v7.65.18 and v7.65.19 archives had the same ZIP timestamps and identical byte sizes for server.js and package.json. Robocopy's default comparison can skip those changed files, leaving the old version in Production.

- Deployment and the application updater include Robocopy /IS and /IT, so same-time/same-size and tweaked files are copied.
- Every deployed payload file is checked against the source SHA-256 manifest immediately after copying, before dependency/database installation.
- The outer worker verifies deployed hashes again before launching and retains exact version and PostgreSQL readiness checks.
- Existing .env, credentials and database settings remain excluded from source replacement; backups and downgrade protection remain in place.
- Regression fixture reproduces old/new files with the same size and timestamp and verifies rejection of stale content, acceptance after replacement, preservation of .env, and rejection of missing/escaping/empty manifest entries.

The full installer still requires Windows validation for UAC, Robocopy and process restart. The isolated integrity helper can also be exercised using PowerShell on Linux.
