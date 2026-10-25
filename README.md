# HealthCheck v7.64.79 Production Windows Installer

[Download installer ZIP](https://github.com/manachai22531/Health-Promotion-Smart-Platform/raw/refs/heads/installers/v7.64.79/HealthCheck-v7.64.79-PRODUCTION-WINDOWS-INSTALLER.zip)

Includes all v7.64.78 functionality and the latest accepted mockups:
- Remove redundant Open Details button beneath the customer name; card navigation remains.
- Personal EXP panel: latest active award medal, today work counts/EXP by type, and own award/revocation history.
- Customer phone/email beside the name; Edit Personal Details opens a dialog, replacing the old inline box. Save/cancel/Escape, context and logout clearing; existing server authorization and locks retained.
- Appointment page has two large tabs: Appointments and Create Schedule. HIS removed from appointment-facing titles/labels; integration unchanged. Schedule creation keeps existing permission and capacity safeguards.
- Previous fictional customer shop preview, independently configured promotion banners and published health knowledge with eligible package links retained.

Extract the entire ZIP to a new folder, run **INSTALL-REPAIR.vbs**, allow UAC, wait for **Complete SUCCESS**, verify **v7.64.79**, then press **Ctrl+F5**. Production target: D:\HealthCheck\Production, port 3000, PostgreSQL health_check_smart_search. Configuration and data are backed up and preserved; do not overlap installer/update jobs. If the old Update Center reports its original readiness error, use **REPAIR-UPDATE-CENTER.vbs** or the direct installer.

Validated: TypeScript build, 51 release tests, real PostgreSQL 78-to-79 upgrade/data/login preservation, live Chromium appointment schedule creation and restricted-role visibility, customer profile save/context/logout, note/card navigation/payment colors/mobile regression, personal EXP ledger and history, content publication/preview persistence, backup/repair core and 22 PowerShell syntax/BOM checks. ZIP CRC and payload hashes verified, including GitHub download-back. Native Windows GUI/UAC/VBS/Robocopy/Task Scheduler installation and physical printing were not executed in Linux.

Only installer artifacts are published on this branch. Main is unchanged; sources and mockups remain in the workspace.
