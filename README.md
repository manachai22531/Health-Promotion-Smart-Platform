# HealthCheck v7.64.73 Production Windows Installer

[Download installer ZIP](https://github.com/manachai22531/Health-Promotion-Smart-Platform/raw/refs/heads/installers/v7.64.73/HealthCheck-v7.64.73-PRODUCTION-WINDOWS-INSTALLER.zip)

[SHA256 checksum](HealthCheck-v7.64.73-PRODUCTION-WINDOWS-INSTALLER.zip.sha256) · [Thai instructions](README-TH.txt)

Includes all v7.64.68–72 changes and the latest accepted layouts:

- Full-width EMR table with receive/open-book actions, filters and a full-width book editor with return-to-table navigation.
- Unified Worklist with the marked KPI cards and redundant board heading removed.
- Compact customer search with the marked title, instructions, database-source text and confirmation-rail header removed; company lookup moves into the toolbar.
- Source backup streams directly into ZIP with capacity checks before stopping Production; database backup remains mandatory. Includes the older Update Center readiness bootstrap repair.

Close any finished installer/updater first. Make sufficient free space on D:; move retained old backup ZIPs to another drive if necessary, preserving Production data, .env and PostgreSQL. Extract the complete ZIP into a new folder and run **INSTALL-REPAIR.vbs**, allow UAC and wait for **Complete SUCCESS**. Verify v7.64.73 and refresh with Ctrl+F5. Do not run overlapping installer/update jobs.

For an old v7.64.68 Update Center with the original preflight error, run the bundled **REPAIR-UPDATE-CENTER.vbs** once before re-uploading the ZIP, or use the direct installer above.

Validated: 28 current release tests, TypeScript build, real isolated PostgreSQL fresh boot and v7.64.72 → v7.64.73 preservation/login test, Chromium workflows for all accepted layouts/security/audit/circular files, PowerShell backup and repair core tests, ZIP/hash integrity and 22 PowerShell script syntax checks. Full Windows GUI/UAC/VBS/Robocopy/Task Scheduler deployment was not executed here; PowerShell core tests used Linux 7.5.4.

This branch contains installer artifacts only; main is unchanged.
