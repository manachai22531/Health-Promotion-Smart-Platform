# HealthCheck v7.64.11 — Production Installer GUI path fix (source-only)

## Scope
This source patch replaces only `tools/production-installer-gui.ps1` **in the next installer source tree**. It is not a standalone installer and should **not** be copied into a running Production application.

## Diagnosis
The v7.64.11 GUI wraps WPF callbacks with `$window.ShowDialog()`. The `Open-Log` fallback launched `notepad.exe` without an explicit working directory and without a second `try/catch`; an invalid inherited 8.3 user-profile path could therefore propagate as an `Installer window error` even after deployment succeeded.

## Changes
- Set a safe session current directory before opening the WPF window.
- Open a log snapshot through Notepad with a verified Windows working directory.
- Handle missing log files and Notepad failures **inside** the button callback, without tearing down WPF.
- Preserve the installer workflow, source/database backups, and Port 3000.

## Validation and limitations
- Static checks: old unsafe fallback removed; new log viewer has explicit working directory and guarded errors; version and other deployment scripts unchanged.
- The patch has **not** been run under Windows PowerShell/WPF or against PostgreSQL Production.
- This GUI exception does not prove installation failure. Verify `http://localhost:3000/api/version` and the final worker log before rerunning the installer.
