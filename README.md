# HealthCheck v7.64.74 Production Windows Installer

[Download installer ZIP](https://github.com/manachai22531/Health-Promotion-Smart-Platform/raw/refs/heads/installers/v7.64.74/HealthCheck-v7.64.74-PRODUCTION-WINDOWS-INSTALLER.zip)

[SHA256 checksum](HealthCheck-v7.64.74-PRODUCTION-WINDOWS-INSTALLER.zip.sha256) · [Thai instructions](README-TH.txt)

Includes all earlier fixes plus the latest accepted work:

- Standalone customer-page setup at `/customer-setup`, opened from Company → ตั้งค่าหน้าลูกค้า. Marketing uses its existing staff account with the dedicated `customerPageManage` permission; no System/API permission is needed. Includes login, role-specific session security, live preview, persistent settings and audit/conflict checks.
- EMR defaults to today's Bangkok date, with Today/All dates, result-complete/approved filters, real PDF review and per-VN approval checks for official printing, plus bulk print (up to 25). Draft reviews are watermarked. Doctors are limited to assigned cases by the new PDF endpoint.
- Full-width customer search; matching action button heights; confirmation list hidden by default and opened as a right-side drawer on demand.
- All v7.64.68–73 security, company/circular, Excel/PDF, master Payor/Plan, audit and installer repairs retained. Source backup streams directly into ZIP and checks disk space before stopping Production.

Do not overlap installer/update jobs. Ensure sufficient free space on D:. Extract the whole ZIP into a new folder, run **INSTALL-REPAIR.vbs**, allow UAC, wait for **Complete SUCCESS**, verify v7.64.74 and refresh with Ctrl+F5. EMR shows today's cases by default; choose **ทุกวัน** to find older cases.

For an old v7.64.68 Update Center with its original preflight error, run the bundled **REPAIR-UPDATE-CENTER.vbs** once before uploading the ZIP again, or use the direct installer above.

Validated: TypeScript build, 35 current release tests, real isolated PostgreSQL fresh boot and v7.64.73 → v7.64.74 preservation/login checks, Chromium workflows including real PDF popup navigation, PDF draft/approval/VN scope checks, PowerShell backup/repair core tests, 22 script syntax checks and full ZIP/manifest/hash integrity. Full Windows GUI/UAC/VBS/Robocopy/Task Scheduler installation and physical printer output were not executed here.

This branch contains installer artifacts only; main is unchanged.
