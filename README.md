# HealthCheck v7.64.76 Production Windows Installer

[Download installer ZIP](https://github.com/manachai22531/Health-Promotion-Smart-Platform/raw/refs/heads/installers/v7.64.76/HealthCheck-v7.64.76-PRODUCTION-WINDOWS-INSTALLER.zip)

[SHA256 checksum](HealthCheck-v7.64.76-PRODUCTION-WINDOWS-INSTALLER.zip.sha256) · [Thai installation and feature instructions](README-TH.txt)

Includes all v7.64.68–75 work plus:

- Per-person company/year notes in search and in the left totals area of the service overview, editable through Save Note or Save All. Scoped permission checks, conflict protection, audit and relational/restart persistence.
- Customer Excel note import, preview, View All tables and export. Both templates include a dedicated personal-note column. Missing/blank imported notes preserve existing notes; template instruction columns are excluded.
- Fixes for all six audited button groups: matrix delete controls, customer catalogue actions and navigation, Worklist status tabs, user/role tabs, and separately opened marketing setup. Customer actions use configured customer branding; staff tabs use Current/Premium/Warm. The selected staff theme syncs across windows.
- Existing customer company/year selection, approved per-VN health books, company outreach/shared hospital appointment quotas, EMR table/review/print, marketing setup, role security, company/PDF/Excel/Payor, EXP shield and installer/Update Center repairs remain included.

Extract the whole ZIP into a new folder, run **INSTALL-REPAIR.vbs**, allow UAC, wait for **Complete SUCCESS**, verify **v7.64.76**, then refresh with **Ctrl+F5**. Target: `D:\HealthCheck\Production`, port 3000, PostgreSQL `health_check_smart_search`. Existing settings and data are preserved and backed up. Do not overlap installer/update jobs; ensure sufficient free space.

For an old Update Center with its original readiness error, run **REPAIR-UPDATE-CENTER.vbs** before reuploading, or use the direct installer.

Validated: TypeScript build, 41 current release tests, real PostgreSQL/Chromium note import/edit/save/restart and theme workflows, previous security/company/EMR/customer/appointment regression workflows, real upgrades from v7.64.74 and v7.64.75, PowerShell backup/repair core, syntax/UTF-8 BOM for 22 PowerShell scripts, ZIP CRC and all 714 payload hashes. Full Windows GUI/UAC/VBS/Robocopy/Task Scheduler installation and physical printing were not executed in the Linux test environment.

This isolated branch contains installer artifacts only. Main is unchanged.
