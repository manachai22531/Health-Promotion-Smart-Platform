# HealthCheck v7.64.70

Fixes Update Center `Production health/version preflight failed` caused by calling a staff-only health endpoint without a session.

[Download Update Center repair](https://github.com/manachai22531/Health-Promotion-Smart-Platform/raw/refs/heads/installers/v7.64.70/HealthCheck-UPDATE-CENTER-REPAIR-v7.64.70.zip)

[Download v7.64.70 installer/update package](https://github.com/manachai22531/Health-Promotion-Smart-Platform/raw/refs/heads/installers/v7.64.70/HealthCheck-v7.64.70-PRODUCTION-WINDOWS-INSTALLER.zip)

For Update Center: wait for the previous update to stop, extract the repair ZIP, run `REPAIR-UPDATE-CENTER.vbs`, then upload the full v7.64.70 ZIP again. Run readiness before installation.
The repair backs up and atomically replaces the updater helper only; it does not stop the app or change the database/.env.
Do not upload the repair ZIP as an update package.

Alternatively, extract the full installer into a new folder and run `INSTALL-REPAIR.vbs` directly.

Includes the latest package layout, subsidiary Payor master and login-history changes, plus prior fixes.
26 release tests, real browser/PostgreSQL checks, upgrade preservation and PowerShell repair core tests passed.
Windows GUI/UAC/VBS and full Windows deployment were not executed in the Linux test environment.
See README-TH.txt and the test report in the installer ZIP.
