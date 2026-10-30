# Diagnostic only. Does not stop or restart services and does not access patient records.
$ErrorActionPreference='Continue'
$root='D:\HealthCheck\Production'
Write-Host '=== HealthCheck Production Update Diagnostic (read-only) ==='
try {
  $v=Invoke-RestMethod 'http://127.0.0.1:3000/api/version' -TimeoutSec 5
  Write-Host ('Live version: ' + $v.version + ', release: ' + $v.release + ', environment: ' + $v.environment)
} catch { Write-Host ('Version endpoint unavailable: ' + $_.Exception.Message) }
try {
  Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction Stop | Select-Object LocalAddress,LocalPort,OwningProcess | Format-Table
} catch { Write-Host ('Port 3000 owner unknown: ' + $_.Exception.Message) }
$status=Join-Path $root 'updates\update-status.json'
if(Test-Path -LiteralPath $status) {
  try {
    $o=Get-Content -LiteralPath $status -Raw | ConvertFrom-Json
    $o | Select-Object phase,failedPhase,message,rolledBack,productionKeptRunning,logPath,updatedAt | Format-List
    if($o.logPath -and (Test-Path -LiteralPath $o.logPath)) {
      Write-Host '=== Last 40 updater-log lines (review for sensitive data before sharing) ==='
      Get-Content -LiteralPath $o.logPath -Tail 40
    }
  } catch { Write-Host ('Cannot read update status: ' + $_.Exception.Message) }
} else { Write-Host 'Update status file not found' }
