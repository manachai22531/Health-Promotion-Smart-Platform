$ErrorActionPreference = 'Stop'
$appRoot = Split-Path -Parent $PSScriptRoot
$installScript = Join-Path $PSScriptRoot 'install.ps1'
$logDir = Join-Path $appRoot 'logs'
$errorLog = Join-Path $logDir 'install-error.log'

New-Item -ItemType Directory -Path $logDir -Force | Out-Null

try {
  & $installScript
  if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) {
    throw "Installer exited with code $LASTEXITCODE"
  }
  exit 0
} catch {
  $message = $_.Exception.Message
  $detail = @(
    "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] INSTALL FAILED"
    "Message: $message"
    "Position: $($_.InvocationInfo.PositionMessage)"
    "Script stack: $($_.ScriptStackTrace)"
  ) -join "`r`n"
  $detail | Set-Content $errorLog -Encoding UTF8

  Write-Host ''
  Write-Host 'Installation failed. This window will remain open.' -ForegroundColor Red
  Write-Host $message -ForegroundColor Yellow
  Write-Host ''
  Write-Host "Error details were saved to: $errorLog" -ForegroundColor Cyan
  Write-Host 'Take a screenshot of this window or send install-error.log for troubleshooting.' -ForegroundColor White
  Write-Host ''
  Read-Host 'Press Enter after you have read or captured the error'
  exit 1
}
