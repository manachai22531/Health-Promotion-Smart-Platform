# HealthCheck v7.64.72 Production Windows Installer

[Download installer ZIP](https://github.com/manachai22531/Health-Promotion-Smart-Platform/raw/refs/heads/installers/v7.64.72/HealthCheck-v7.64.72-PRODUCTION-WINDOWS-INSTALLER.zip)

[SHA256](HealthCheck-v7.64.72-PRODUCTION-WINDOWS-INSTALLER.zip.sha256) · [Thai instructions](README-TH.txt)

Repairs the direct installer's source backup after the reported `Compress-Archive: There is not enough space on the disk` failure. Includes all v7.64.68–71 changes and the unified Worklist.

Source files now stream directly into a ZIP without a temporary source copy. A capacity check runs before stopping Production, followed by a second check against the final snapshot. It retains hidden configuration and user uploads, excludes top-level generated caches and downloaded update artifacts, reports byte/file progress, verifies ZIP entry sizes, and removes its own incomplete ZIP on failure. It never deletes old backups automatically. Database backup remains mandatory.

Close the failed installer. Make sufficient space on D: by moving retained old backup ZIPs to another drive; preserve Production data, .env and PostgreSQL. Extract this ZIP into a new folder, run **INSTALL-REPAIR.vbs**, allow UAC, and wait for **Complete SUCCESS**. Verify v7.64.72 and refresh with Ctrl+F5. Do not overlap installer/update jobs.

For the old v7.64.68 Update Center, run the bundled **REPAIR-UPDATE-CENTER.vbs** before re-uploading the ZIP, or use direct installation as recommended above.

Validated: 28 current release tests, TypeScript build, isolated PostgreSQL v7.64.71 → v7.64.72 preservation/login test, PowerShell source-backup round-trip/failure/low-space-before-stop tests and updater repair core. ZIP, manifest and PowerShell syntax checks passed. Full Windows GUI/UAC/Robocopy/Task Scheduler deployment was not executed; PowerShell runtime tests used Linux 7.5.4.

Capacity estimate covers worst-case source ZIP + payload + 1 GiB. A large database backup or dependency install may require more space. The installer does not create additional disk capacity.

This branch contains installer artifacts only; main is unchanged.
