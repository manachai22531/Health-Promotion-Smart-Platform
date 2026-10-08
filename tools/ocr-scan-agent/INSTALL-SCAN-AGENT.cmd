@echo off
setlocal EnableExtensions
chcp 65001 >nul
title HealthCheck Scan Agent v7.63.53 Installer

set "VER=v7.63.53"
set "ROOT=%LOCALAPPDATA%\HealthCheckScanAgent"
set "DEST=%ROOT%\%VER%"
set "EXE=%DEST%\HealthCheckTwainAgent.exe"

echo HealthCheck Scan Agent v7.63.53
echo TWAIN Memory x86 - Source Scan preferred - no compile / no Internet / no NuGet
echo.

echo [1/6] Closing older HealthCheck Scan Agent process...
taskkill /IM HealthCheckTwainAgent.exe /F >nul 2>&1
timeout /t 1 /nobreak >nul 2>&1

echo [2/6] Creating versioned install folder...
if not exist "%DEST%" mkdir "%DEST%" 2>nul
if not exist "%DEST%" goto :fail_folder

echo [3/6] Installing TWAIN x86 host...
copy /Y /B "%~dp0HealthCheckTwainAgent.exe" "%EXE%" >nul
if errorlevel 1 goto :fail_copy
if not exist "%EXE%" goto :fail_copy
for %%A in ("%EXE%") do set "COPIED_SIZE=%%~zA"
if not defined COPIED_SIZE goto :fail_copy
if %COPIED_SIZE% LSS 100000 goto :fail_copy
echo       Copied %COPIED_SIZE% bytes.

echo [4/6] Installing documentation...
copy /Y /B "%~dp0README.txt" "%DEST%\README.txt" >nul 2>&1
>"%DEST%\VERSION.txt" echo v7.63.53-twain-memory-x86
>"%ROOT%\CURRENT.txt" echo %VER%

echo [5/6] Registering healthcheckscan:// for CURRENT USER...
reg.exe add "HKCU\Software\Classes\healthcheckscan" /ve /d "URL:HealthCheck Scanner Protocol" /f >nul || goto :fail_reg
reg.exe add "HKCU\Software\Classes\healthcheckscan" /v "URL Protocol" /d "" /f >nul || goto :fail_reg
reg.exe add "HKCU\Software\Classes\healthcheckscan\DefaultIcon" /ve /d "%%SystemRoot%%\System32\wiaacmgr.exe,0" /f >nul || goto :fail_reg
reg.exe add "HKCU\Software\Classes\healthcheckscan\shell\open\command" /ve /d "\"%EXE%\" \"%%1\"" /f >nul || goto :fail_reg

echo [6/6] Verifying registration...
reg.exe query "HKCU\Software\Classes\healthcheckscan\shell\open\command" /ve | findstr /I /C:"%VER%" >nul
if errorlevel 1 goto :fail_verify

echo.
echo SUCCESS: HealthCheck Scan Agent v7.63.53 installed.
echo Installed path: %DEST%
echo TWAIN Source: exact "Scan" preferred ^| WIA wrappers ignored for TWAIN
echo Transfer: Memory first ^| detailed TWAIN ConditionCode on error
echo.
echo Next: run TEST-TWAIN-SOURCES.cmd, then return to HealthCheck OCR and click Scan Scanner.
echo.
pause
exit /b 0

:fail_folder
echo ERROR: Cannot create install folder: %DEST%
goto :fail
:fail_copy
echo ERROR: Cannot copy HealthCheckTwainAgent.exe to %EXE%
goto :fail
:fail_reg
echo ERROR: Could not register healthcheckscan:// for current user.
goto :fail
:fail_verify
echo ERROR: Protocol registration verification failed.
goto :fail
:fail
echo Installation was not completed.
pause
exit /b 1
