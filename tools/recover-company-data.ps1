$ErrorActionPreference = 'Stop'
$appRoot = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $appRoot '.env'
$updateDir = Join-Path $appRoot 'updates'
$logDir = Join-Path $appRoot 'logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$log = Join-Path $logDir ("company-recovery-{0}.log" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
function Log([string]$m){ $line="[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $m"; $line | Tee-Object -FilePath $log -Append }
function Read-Env([string]$path){
  $map=@{}; Get-Content -LiteralPath $path | ForEach-Object {
    $line=[string]$_; if($line.Length -gt 0){$line=$line.TrimStart([char]0xFEFF)}
    if([string]::IsNullOrWhiteSpace($line) -or $line -match '^\s*#'){return}
    if($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$'){
      $v=$matches[2].Trim(); if($v -notmatch '^["'']'){$v=($v -replace '\s+#.*$','').Trim()}; $map[$matches[1]]=$v.Trim().Trim('"').Trim("'")
    }
  }; return $map
}
function Find-Pg([string]$exe){
  $candidates=@(
    "C:\Program Files\PostgreSQL\17\bin\$exe",
    "C:\Program Files\PostgreSQL\16\bin\$exe",
    "C:\Program Files\PostgreSQL\15\bin\$exe",
    "C:\Program Files\PostgreSQL\14\bin\$exe"
  )
  foreach($p in $candidates){if(Test-Path -LiteralPath $p){return $p}}
  $cmd=Get-Command $exe -ErrorAction SilentlyContinue; if($cmd){return $cmd.Source}
  throw "ไม่พบ $exe กรุณาตรวจสอบ PostgreSQL installation"
}
if(-not (Test-Path -LiteralPath $envFile)){throw "ไม่พบ $envFile"}
$cfg=Read-Env $envFile
foreach($k in @('PGDATABASE','PGUSER')){if(-not $cfg.ContainsKey($k) -or [string]::IsNullOrWhiteSpace([string]$cfg[$k])){throw "ไม่พบ $k ใน .env"}}
$host=if($cfg.PGHOST){$cfg.PGHOST}else{'127.0.0.1'}
$port=if($cfg.PGPORT){$cfg.PGPORT}else{'5432'}
$db=$cfg.PGDATABASE; $user=$cfg.PGUSER; $env:PGPASSWORD=[string]$cfg.PGPASSWORD
$pgRestore=Find-Pg 'pg_restore.exe'; $pgDump=Find-Pg 'pg_dump.exe'; $psql=Find-Pg 'psql.exe'
$backup=Get-ChildItem -LiteralPath $updateDir -Filter 'database-before-v7.62.91-*.backup' -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if(-not $backup){
  $backup=Get-ChildItem -LiteralPath $updateDir -Filter 'database-before-v7.62.9*.backup' -File -ErrorAction SilentlyContinue | Where-Object {$_.Name -notmatch 'v7\.62\.92'} | Sort-Object LastWriteTime -Descending | Select-Object -First 1
}
if(-not $backup){throw "ไม่พบ database backup ก่อน v7.62.91 ใน $updateDir"}
Log "Using source backup: $($backup.FullName)"
# Stop only the HealthCheck node process that owns Production port.
try{
  $listener=Get-NetTCPConnection -State Listen -LocalPort 3000 -ErrorAction SilentlyContinue | Select-Object -First 1
  if($listener){
    $owner=Get-CimInstance Win32_Process -Filter "ProcessId = $($listener.OwningProcess)" -ErrorAction SilentlyContinue
    if($owner -and $owner.Name -ieq 'node.exe' -and ([string]$owner.CommandLine).IndexOf($appRoot,[StringComparison]::OrdinalIgnoreCase) -ge 0){
      Log "Stopping HealthCheck node PID $($owner.ProcessId)"; Stop-Process -Id $owner.ProcessId -Force; Start-Sleep -Seconds 1
    }
  }
}catch{Log "WARN stop process: $($_.Exception.Message)"}
$safety=Join-Path $updateDir ("database-before-company-recovery-{0}.backup" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
Log "Creating safety backup: $safety"
& $pgDump -h $host -p $port -U $user -d $db -F c -f $safety
if($LASTEXITCODE -ne 0){throw "สร้าง safety backup ไม่สำเร็จ (pg_dump exit $LASTEXITCODE)"}
$checkSql="SELECT (SELECT COUNT(*) FROM companies) companies,(SELECT COUNT(*) FROM company_years) company_years,(SELECT COUNT(*) FROM customers) customers,(SELECT COUNT(*) FROM company_customers) company_customers;"
Log "Current counts:"; & $psql -h $host -p $port -U $user -d $db -Atc $checkSql | ForEach-Object {Log $_}
Log "Clearing only relational company/customer tables"
$clearSql="BEGIN; DELETE FROM company_customers; DELETE FROM customers; DELETE FROM company_years; DELETE FROM companies; COMMIT;"
& $psql -h $host -p $port -U $user -d $db -v ON_ERROR_STOP=1 -c $clearSql
if($LASTEXITCODE -ne 0){throw "เตรียมตารางสำหรับ restore ไม่สำเร็จ"}
Log "Restoring companies/company_years/customers/company_customers only"
& $pgRestore -h $host -p $port -U $user -d $db --data-only --no-owner --no-privileges --exit-on-error -t companies -t company_years -t customers -t company_customers $backup.FullName
if($LASTEXITCODE -ne 0){throw "pg_restore ไม่สำเร็จ exit $LASTEXITCODE; safety backup อยู่ที่ $safety"}
$counts=& $psql -h $host -p $port -U $user -d $db -Atc $checkSql
Log "Restored counts: $counts"
$parts=([string]$counts).Trim().Split('|')
if($parts.Count -lt 4 -or [int64]$parts[0] -le 0 -or [int64]$parts[1] -le 0 -or [int64]$parts[3] -le 0){throw "restore เสร็จแต่จำนวนข้อมูลไม่สมเหตุสมผล: $counts"}
Log "[OK] Company/customer relational data recovered. Workflow Booking/Visit tables were not modified."
$run=Join-Path $PSScriptRoot 'run.ps1'
if(Test-Path -LiteralPath $run){Start-Process powershell.exe -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',"`"$run`"") -WorkingDirectory $appRoot}
Write-Host ""
Write-Host "[OK] กู้ข้อมูลบริษัทและลูกค้าสำเร็จ" -ForegroundColor Green
Write-Host "Backup ต้นทาง: $($backup.Name)"
Write-Host "Safety backup: $safety"
Write-Host "Log: $log"
