@echo off
setlocal
cd /d "%~dp0"
if not exist "%~dp0tools\start-production-installer.ps1" (
  echo Installer files are incomplete. Extract the ZIP completely.
  pause
  exit /b 2
)
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -STA -ExecutionPolicy Bypass -File "%~dp0tools\start-production-installer.ps1" -RepairUpdateCenter
if errorlevel 1 (
  echo Installation could not start. Keep Windows Security enabled and review the message above.
  pause
  exit /b 1
)
exit /b 0
