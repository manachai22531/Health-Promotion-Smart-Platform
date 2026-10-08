$ErrorActionPreference = 'Stop'

$installScript = Join-Path $PSScriptRoot 'install-wrapper.ps1'
$appRoot = Split-Path -Parent $PSScriptRoot
$powershellExe = Join-Path $PSHOME 'powershell.exe'

function Test-IsAdministrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

try {
  if (Test-IsAdministrator) {
    & $powershellExe -NoProfile -ExecutionPolicy Bypass -File $installScript
    exit $LASTEXITCODE
  }

  Write-Host 'Requesting administrator permission. Click Yes once in the Windows prompt...' -ForegroundColor Cyan
  $argumentList = '-NoProfile -ExecutionPolicy Bypass -File "' + $installScript + '"'
  $process = Start-Process `
    -FilePath $powershellExe `
    -ArgumentList $argumentList `
    -WorkingDirectory $appRoot `
    -Verb RunAs `
    -Wait `
    -PassThru

  exit $process.ExitCode
} catch {
  Write-Host ''
  Write-Host ('Could not start the installer: ' + $_.Exception.Message) -ForegroundColor Red
  exit 1
}
