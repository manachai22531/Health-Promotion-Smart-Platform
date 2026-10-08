@echo off
setlocal
cd /d "%~dp0"
echo ============================================================
echo Health Check Up Smart Search - Recover Company Data
echo Restores ONLY companies/company_years/customers/company_customers
echo Booking / Project / Visit tables are NOT restored or deleted.
echo ============================================================
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\recover-company-data.ps1"
set ERR=%ERRORLEVEL%
echo.
if not "%ERR%"=="0" (
  echo [FAILED] Recovery failed. Check logs\company-recovery-*.log
) else (
  echo [OK] Recovery completed.
)
pause
exit /b %ERR%
