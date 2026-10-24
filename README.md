# HealthCheck v7.64.77 Production Windows Installer

[Download installer ZIP](https://github.com/manachai22531/Health-Promotion-Smart-Platform/raw/refs/heads/installers/v7.64.77/HealthCheck-v7.64.77-PRODUCTION-WINDOWS-INSTALLER.zip)

[SHA256 checksum](HealthCheck-v7.64.77-PRODUCTION-WINDOWS-INSTALLER.zip.sha256) · [Thai installation and feature instructions](README-TH.txt)

Includes all v7.64.68–76 features and fixes, plus the latest accepted overview behavior:

- Overview personal notes are read-only text, with an explicit Open Details action. Editing and Save Note / Save All remain inside patient details. Saved/cleared notes refresh the overview immediately.
- Empty notes and selected-contract sections retain compact headings and short empty labels. Populated sections show saved content and package counts. There is no large reserved empty box.
- Compact card/table spacing and natural package-panel height reduce scrolling. Billing cells stay blue, self-pay green and primary packages yellow across all appearance themes.
- Existing Excel notes import/export/View All, concurrent edit protection and audit, customer company/year contexts, approved health books, appointment quotas, EMR, marketing setup, theme fixes, security policies and installer repairs remain included.

Extract the entire ZIP to a new folder, run **INSTALL-REPAIR.vbs**, allow UAC, wait for **Complete SUCCESS**, verify **v7.64.77**, then refresh with **Ctrl+F5**. Target: `D:\HealthCheck\Production`, port 3000, PostgreSQL `health_check_smart_search`. Existing configuration/data are preserved and backed up. Do not overlap installer/update jobs; ensure sufficient free disk space.

For an old Update Center with its original readiness error, run **REPAIR-UPDATE-CENTER.vbs** before reuploading, or use the direct installer.

Validated: TypeScript build; 41 release tests; actual PostgreSQL/Chromium overview read-only/inside editing, empty headings, compactness, package colors and responsive layouts; note import/export/restart and Save All; customer books/appointments; security/company/EMR regression workflows; v7.64.76 → v7.64.77 data/login preservation; themes and cross-window sync; PowerShell backup/repair core; 22 PowerShell syntax/BOM checks; ZIP CRC and all 717 payload hashes. Full Windows GUI/UAC/VBS/Robocopy/Task Scheduler installation and physical printing were not exercised in the Linux test environment.

This isolated branch contains installer artifacts only. Main is unchanged.
