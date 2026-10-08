@echo off
setlocal EnableExtensions
set "ROOT=%LOCALAPPDATA%\HealthCheckScanAgent"
set "CUR=v7.63.53"
if exist "%ROOT%\CURRENT.txt" set /p CUR=<"%ROOT%\CURRENT.txt"
set "EXE=%ROOT%\%CUR%\HealthCheckTwainAgent.exe"
if not exist "%EXE%" (
  echo HealthCheck Scan Agent is not installed at:
  echo %EXE%
  echo Run INSTALL-SCAN-AGENT.cmd first.
  pause
  exit /b 1
)
echo HealthCheck Scan Agent: %CUR%
echo Executable: %EXE%
echo.
"%EXE%" --list-sources
set "RC=%ERRORLEVEL%"
echo.
if not "%RC%"=="0" echo TWAIN source test returned error code %RC%.
pause
exit /b %RC%
