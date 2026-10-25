# HealthCheck v7.64.78 Production Windows Installer

[Download installer ZIP](https://github.com/manachai22531/Health-Promotion-Smart-Platform/raw/refs/heads/installers/v7.64.78/HealthCheck-v7.64.78-PRODUCTION-WINDOWS-INSTALLER.zip)

Includes all v7.64.77 functionality plus separate fictional customer shop preview; independently configured login/shop promotion banners; searchable published health articles with references and reviewer information, linked only to packages eligible for the active customer company/year. Marketing manages content and publication in Customer Setup. Unpublished articles are excluded from the public settings API.

Extract the entire ZIP, run **INSTALL-REPAIR.vbs**, allow UAC, wait for **Complete SUCCESS**, verify **v7.64.78**, then press **Ctrl+F5**. Production target: D:\HealthCheck\Production, port 3000, PostgreSQL health_check_smart_search. Existing configuration and data are preserved and backed up. For the older Update Center readiness issue, use **REPAIR-UPDATE-CENTER.vbs** or run the direct installer.

Validated: TypeScript build, 44 release tests, real PostgreSQL 77-to-78 upgrade and content persistence/audit/conflict/auth checks, running-server Chromium customer setup/login/shop and related package navigation, responsive content browser checks, 22 PowerShell syntax/BOM checks and backup/repair core. ZIP CRC and all payload hashes checked. Native Windows GUI/UAC/VBS/Robocopy/Task Scheduler installation and physical printing were not executed in Linux.

Only installer artifacts are published on this branch. Application sources/mockups stay in the workspace; main is unchanged.
