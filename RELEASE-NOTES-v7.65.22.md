# v7.65.22

## Customer template preparation
- Add a dedicated “เตรียมเทมเพลตลูกค้า” menu, using existing customerImport permission.
- Prepare company/year, screening dates, primary package and billing/location defaults without reading or exporting existing patient records.
- Export styled XLSX templates with text formats for identifiers, instruction sheet and reference dropdowns.

## Company and employee HTML forms
- Export a self-contained HTML file with bundled Excel support and no remote network dependencies.
- Company users can enter records or upload Excel/UTF-8 CSV/returned HTML, validate missing fields, dates and duplicate identifiers, then return XLSX or save HTML progress.
- Company users can distribute a blank one-person employee HTML, preserving configured company/package defaults while removing existing records and personal form/table values.
- Employees fill their own details and download the completed HTML to return to the company.
- Company users can combine up to 100 returned files per batch, reject mismatched template files before changing records, and review duplicate/missing data before exporting the combined Excel for existing system import.
- HTML forms use manual file return; they do not submit data to an online endpoint.

## Installer
- Preserve v7.65.21 manifest-driven overwrite, per-file hash validation, backups, downgrade protection and runtime configuration preservation.
- Show startup waiting progress and version API observations about every five seconds, including stdout/stderr log paths.
- Includes all earlier navigation/PDF grouping, HN QR, Location/Room, medication/vaccine and package performance changes.

Validation: release tests, TypeScript build, company/employee/offline browser round trips, existing navigation browser suites, PowerShell parsing and copy regression, and complete archive hash validation. Full Windows GUI/UAC, hospital HIS and physical printer are not tested here; the previously reported Windows Start delay still requires the machine's startup logs to diagnose.
