# v7.62.75 Production Installer PowerShell Encoding Fix

## Root cause
`tools/production-installer-gui.ps1` was saved as UTF-8 without BOM while containing non-ASCII punctuation. Windows PowerShell 5.1 may read such scripts using the legacy ANSI code page, corrupting the punctuation inside a quoted expression and producing cascading parser errors such as `Unexpected token`, `string is missing the terminator`, and missing closing braces.

## Fix
- Converted all `tools/*.ps1` scripts to UTF-8 with BOM for Windows PowerShell 5.1 compatibility.
- Replaced non-ASCII punctuation in `production-installer-gui.ps1` with ASCII equivalents.
- Kept Thai text in other PowerShell scripts, protected by UTF-8 BOM.
- Bumped release to v7.62.75.
- No database schema changes were added by this hotfix. Existing migrations remain unchanged.

## Installer target
Production only: `D:\HealthCheck\Production`, port 3000, database `health_check_smart_search`.
