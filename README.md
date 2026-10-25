# HealthCheck v7.64.80 Production Windows Installer

[Download installer ZIP](https://github.com/manachai22531/Health-Promotion-Smart-Platform/raw/refs/heads/installers/v7.64.80/HealthCheck-v7.64.80-PRODUCTION-WINDOWS-INSTALLER.zip)

Includes all v7.64.79 work, plus:
- Customer appointment type automatically follows the selected project: Mobile uses company outreach; Inhouse uses shared hospital slots. No redundant type selector. Backend prevents mismatched booking/rescheduling.
- New third staff tab **Customer Bookings**, after Create Schedule. Real self-service bookings in Day/Week/Month views with actual slot occupancy, quotas and clickable customer details. Operating day: 08:00 until next-day 08:00; default grid 30 minutes.
- Grid interval follows the value used when creating schedules. Existing slots, durations, capacities and reservations remain unchanged. Overnight generation supported; initial creation date range is one week to stay within the 1,000-slot limit.
- Read-only calendar requires appointmentView; creation/changes require appointmentScheduleManage. Company filtering retains shared hospital occupancy. Cancelled bookings release capacity and remain visible in details.
- **The original imported hospital appointment screen retains its existing layout.** The new time grid applies only to Customer Bookings.

Extract the entire ZIP, run **INSTALL-REPAIR.vbs**, allow UAC, wait for **Complete SUCCESS**, verify **v7.64.80**, then press **Ctrl+F5**. Production target: D:\HealthCheck\Production, port 3000, PostgreSQL health_check_smart_search. Configuration/data are backed up and preserved; do not run overlapping installers/updates. For the older Update Center readiness error, use **REPAIR-UPDATE-CENTER.vbs** or the direct installer.

Validated: TypeScript build, 53 release tests, actual PostgreSQL 79-to-80 upgrade with data/login preservation, project-type/booking/rescheduling/overnight/calendar API checks, full-server Chromium customer booking visible in staff calendar, Day/Week/Month/mobile/navigation/auth checks, preserved original appointment view and previous profile/note/theme workflows, content setup persistence and preview regressions, backup/repair core and 22 PowerShell syntax/BOM checks. ZIP CRC and all payload hashes checked, including GitHub download-back. Native Windows GUI/UAC/VBS/Robocopy/Task Scheduler installation and physical printing were not executed in Linux.

This branch contains installer artifacts only. Main is unchanged; app sources and mockups remain in the workspace.
