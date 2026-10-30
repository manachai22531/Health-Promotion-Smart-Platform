param([switch]$Remove)
$ErrorActionPreference = 'Stop'
$taskName = 'HealthCheck-Production-AutoStart'
$appRoot = Split-Path -Parent $PSScriptRoot
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Run as administrator to configure automatic startup.' }
if ($Remove) {
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
  Write-Host 'Automatic startup removed. The existing application files and data were retained.'
  exit 0
}
if (-not (Test-Path -LiteralPath (Join-Path $appRoot '.env'))) { throw 'Install/repair the application first (.env is missing).' }
$node = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
if (-not $node -and (Test-Path 'C:\Program Files\nodejs\node.exe')) { $node = 'C:\Program Files\nodejs\node.exe' }
if (-not $node) { throw 'Node.js was not found.' }
$action = New-ScheduledTaskAction -Execute $node -Argument ('"' + (Join-Path $appRoot 'server.js') + '"') -WorkingDirectory $appRoot
$trigger = New-ScheduledTaskTrigger -AtStartup
$trigger.Delay = 'PT30S'
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$account = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $account -Description 'HealthCheck Production on port 3000; startup without Windows sign-in and retry after unexpected exit.' -Force | Out-Null
$installed = Get-ScheduledTask -TaskName $taskName -ErrorAction Stop
if (-not $installed) { throw 'Could not verify automatic startup registration.' }
Write-Host 'Automatic startup registered. It starts at the next Windows boot, 30 seconds after startup. No sign-in is required.'
