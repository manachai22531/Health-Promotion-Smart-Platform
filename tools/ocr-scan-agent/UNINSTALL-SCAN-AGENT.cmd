@echo off
setlocal EnableExtensions
taskkill /IM HealthCheckTwainAgent.exe /F >nul 2>&1
reg.exe delete "HKCU\Software\Classes\healthcheckscan" /f >nul 2>&1
rmdir /S /Q "%LOCALAPPDATA%\HealthCheckScanAgent" >nul 2>&1
echo HealthCheck Scan Agent removed for current user.
pause
