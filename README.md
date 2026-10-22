# HealthCheck v7.64.71 Production Windows Installer

[Download installer ZIP](https://github.com/manachai22531/Health-Promotion-Smart-Platform/raw/refs/heads/installers/v7.64.71/HealthCheck-v7.64.71-PRODUCTION-WINDOWS-INSTALLER.zip)

[SHA256 checksum](HealthCheck-v7.64.71-PRODUCTION-WINDOWS-INSTALLER.zip.sha256) · [Thai instructions](README-TH.txt)

Includes all v7.64.68–70 fixes, the unified Worklist table and the Update Center readiness repair.

For an existing v7.64.68 installation, extract the full ZIP into a new folder and run **INSTALL-REPAIR.vbs** after the previous installer/updater has finished. This upgrades directly, avoiding the old installed updater's preflight. Do not run overlapping installers. Target: `D:\HealthCheck\Production`, port 3000. Wait for `Complete SUCCESS`, verify v7.64.71 and refresh with Ctrl+F5.

To use Update Center instead, first run the bundled **REPAIR-UPDATE-CENTER.vbs** from the extracted ZIP, then upload the installer ZIP again and perform Preflight/Install. This repairs and backs up only the installed helper; it refuses active update jobs. ZIP upload alone cannot repair an old helper that runs before deployment.

Validated with 28 current release tests, isolated PostgreSQL startup/upgrade and Chromium workflows, plus PowerShell syntax, repair core and payload verification on Linux. Full Windows GUI/UAC/Robocopy/Task Scheduler deployment was not executed here. Source backup compression speed is unchanged.

This branch contains installer artifacts only; `main` is unchanged.
