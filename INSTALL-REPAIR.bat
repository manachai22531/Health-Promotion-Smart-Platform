@echo off
setlocal
cd /d "%~dp0"
if not exist "%~dp0tools\start-production-installer.vbs" (
  echo.
  echo Installer files are incomplete.
  echo Please extract the ZIP completely and run INSTALL-REPAIR.bat again.
  echo Missing: tools\start-production-installer.vbs
  echo.
  pause
  exit /b 2
)
start "" /wait wscript.exe "%~dp0tools\start-production-installer.vbs"
exit /b %errorlevel%
