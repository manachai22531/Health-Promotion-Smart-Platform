# HealthCheck v7.64.75 Production Windows Installer

[Download installer ZIP](https://github.com/manachai22531/Health-Promotion-Smart-Platform/raw/refs/heads/installers/v7.64.75/HealthCheck-v7.64.75-PRODUCTION-WINDOWS-INSTALLER.zip)

[SHA256 checksum](HealthCheck-v7.64.75-PRODUCTION-WINDOWS-INSTALLER.zip.sha256) · [Thai installation and feature instructions](README-TH.txt)

Includes all v7.64.68–74 fixes and the newly completed work:

- Customer catalogue uses grouped list tables, category icons on the left and a cart on the right. Company/year, masked identity and primary packages are above the catalogue; personal details are expandable.
- Customer company/year contexts are scoped to verified ID/Passport and date of birth. Name-only and QR sessions remain restricted to their verified record.
- Customers can view/download only their own doctor-approved health books, grouped by company/year/visit, with PDF approval and VN ownership checks on every request.
- Self-service appointments from staff-created schedules only. Company outreach slots are restricted to that company/year; hospital slots share capacity across all companies. Automatic generation by date range, weekday and time interval, per-slot capacity/cutoff, close/reopen and staff booking status management.
- Transactional capacity checks prevent concurrent overbooking; duplicate bookings, ownership, project eligibility, cancellation and rescheduling rules are enforced server-side and audited.
- Search action buttons align on one baseline; the header EXP shield sits before the username and opens a popover, with no duplicate LV label.
- Existing EMR table/today/review/print, standalone marketing customer setup, role-specific security, company/PDF/Excel/master Payor and installer repairs remain included.

Extract the whole ZIP to a new folder and run **INSTALL-REPAIR.vbs**, allow UAC, wait for **Complete SUCCESS**, verify **v7.64.75**, then refresh the app with **Ctrl+F5**. Target: `D:\HealthCheck\Production`, port 3000, PostgreSQL `health_check_smart_search`. Existing configuration/data are preserved and backed up. Do not overlap installer/update jobs; ensure sufficient free disk space.

If the old Update Center reports its original public readiness error, run the bundled **REPAIR-UPDATE-CENTER.vbs** before reuploading, or use the direct installer.

To enable customer appointments: open a company/year project with valid start/end dates, then go to **นัดหมาย HIS → จัดการตารางรับนัดลูกค้า** and create slots. Admin can manage schedules; other roles need `appointmentView` and `appointmentScheduleManage`. Slots/appointments do not automatically create HIS Visits or Orders.

Validated: TypeScript build; 41 current release tests; real PostgreSQL customer identity/PDF access, company quotas and concurrent booking/reschedule/cancellation; actual Chromium customer/staff workflows and responsive layouts; security/company/PDF/EMR regression workflows; v7.64.74 → v7.64.75 preservation/login upgrade; PowerShell backup/repair core; 22 PowerShell script syntax/BOM checks; ZIP CRC and all 704 payload hashes. Actual Windows GUI/UAC/VBS/Robocopy/Task Scheduler installation and physical printer output were not executed in this Linux environment.

This isolated branch contains installer artifacts only. Main is unchanged.
