param([ValidateSet('production')][string]$Environment='production')
$ErrorActionPreference='Stop'
$sourceRoot=Split-Path -Parent $PSScriptRoot
$targetRoot='D:\HealthCheck\Production'
$displayName='PRODUCTION'
. (Join-Path $PSScriptRoot 'source-backup.ps1')

function Test-IsAdministrator {
  $identity=[Security.Principal.WindowsIdentity]::GetCurrent()
  $principal=New-Object Security.Principal.WindowsPrincipal($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if(-not(Test-IsAdministrator)){
  $powershellExe=Join-Path $PSHOME 'powershell.exe'
  $arguments='-NoProfile -ExecutionPolicy Bypass -File "'+$PSCommandPath+'" -Environment '+$Environment
  $process=Start-Process -FilePath $powershellExe -ArgumentList $arguments -WorkingDirectory $sourceRoot -Verb RunAs -Wait -PassThru
  exit $process.ExitCode
}

Write-Host "Health Check Smart Search $displayName" -ForegroundColor Cyan
Write-Host "โฟลเดอร์ปลายทาง: $targetRoot" -ForegroundColor Yellow

function Stop-TargetServer {
  param([string]$Root)
  $normalized=$Root.TrimEnd('\')
  $processes=@(Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue | Where-Object {
    $_.CommandLine -and $_.CommandLine -match '(?i)(^|[\/"\s])server\.js(["\s]|$)' -and $_.CommandLine.IndexOf($normalized,[StringComparison]::OrdinalIgnoreCase)-ge 0
  })

  # Fallback for older launchers that used a relative `node server.js` command
  # line. Only trust the port listener after the running application identifies
  # itself as the expected environment through /api/version.
  $expectedPort=3000
  try {
    $listener=Get-NetTCPConnection -State Listen -LocalPort $expectedPort -ErrorAction Stop | Select-Object -First 1
    if($listener){
      $uri="http://127.0.0.1:$expectedPort/api/version"
      $v=Invoke-RestMethod -Uri $uri -TimeoutSec 2 -ErrorAction Stop
      if([string]$v.environment -eq $Environment){
        $owner=Get-CimInstance Win32_Process -Filter "ProcessId = $($listener.OwningProcess)" -ErrorAction SilentlyContinue
        if($owner -and $owner.Name -ieq 'node.exe' -and -not($processes | Where-Object ProcessId -eq $owner.ProcessId)){
          $processes += $owner
        }
      }
    }
  } catch {}

  foreach($process in $processes){Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue}
  if($processes.Count -gt 0){Start-Sleep -Seconds 1}
}

function Start-ExistingServerIfPossible {
  param([string]$Root)
  try {
    $run=Join-Path $Root 'tools\\run.ps1'
    if(Test-Path -LiteralPath $run){
      Write-Host 'Attempting to restart the existing Production app after deployment/backup failure...'
      & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $run
      if($LASTEXITCODE -ne 0){Write-Warning "Existing app restart returned exit code $LASTEXITCODE. See Production\logs\launcher.log"}
    }
  } catch {Write-Warning ("Could not restart existing Production: "+$_.Exception.Message)}
}

function Invoke-RobocopySafe {
  param(
    [string]$Source,
    [string]$Destination,
    [string[]]$ExcludeDirs=@(),
    [string[]]$ExcludeFiles=@()
  )
  $args=@($Source,$Destination,'/E','/R:3','/W:1','/XJ','/COPY:DAT','/DCOPY:DAT','/NFL','/NDL','/NJH','/NJS','/NP')
  if($ExcludeDirs.Count -gt 0){$args += '/XD'; $args += $ExcludeDirs}
  if($ExcludeFiles.Count -gt 0){$args += '/XF'; $args += $ExcludeFiles}
  & robocopy.exe @args | Out-Null
  $code=$LASTEXITCODE
  if($code -gt 7){throw "Robocopy failed with exit code $code while copying $Source"}
}

# Scan only backup content and check capacity BEFORE stopping the existing app.
$backupRoot='D:\HealthCheck\Backups'
$hasExisting=(Test-Path -LiteralPath $targetRoot) -and (Get-ChildItem -LiteralPath $targetRoot -Force -ErrorAction Stop | Select-Object -First 1)
$payloadPlan=Get-SourceBackupPlan -Root $sourceRoot
if($hasExisting){
  Write-Host 'Inspecting Source backup size and free space before stopping Production...'
  $backupPlan=Get-SourceBackupPlan -Root $targetRoot
  Assert-SourceBackupSpace -Plan $backupPlan -Destination $backupRoot -PayloadBytes $payloadPlan.Bytes
}

Write-Host "Stopping the existing Production server before backup..."
. (Join-Path $PSScriptRoot 'assert-no-downgrade.ps1')
Assert-NoApplicationDowngrade -SourceRoot $sourceRoot -TargetRoot $targetRoot
Stop-TargetServer -Root $targetRoot

if($hasExisting){
  try {
    New-Item -ItemType Directory -Force -Path $backupRoot | Out-Null
    $stamp=(Get-Date -Format 'yyyyMMdd-HHmmss')+'-'+[Guid]::NewGuid().ToString('N').Substring(0,8)
    $backupVersion='unknown'
    $pkgPath=Join-Path $sourceRoot 'package.json'
    if(Test-Path -LiteralPath $pkgPath){$pkg=Get-Content -LiteralPath $pkgPath -Raw|ConvertFrom-Json;if($pkg.version){$backupVersion=([string]$pkg.version).TrimStart('v')}}
    $sourceBackup=Join-Path $backupRoot ("PRODUCTION-source-before-v$backupVersion-$stamp.zip")
    # Rescan after shutdown so the snapshot includes final writes, then recheck.
    $backupPlan=Get-SourceBackupPlan -Root $targetRoot
    Assert-SourceBackupSpace -Plan $backupPlan -Destination $backupRoot -PayloadBytes $payloadPlan.Bytes
    Write-Host "Streaming Source backup directly to $sourceBackup (no temporary source copy)..."
    Write-SourceBackupZip -Plan $backupPlan -Destination $sourceBackup
  } catch {
    Write-Host ("Source backup failed: "+$_.Exception.Message)
    Start-ExistingServerIfPossible -Root $targetRoot
    throw
  }
  Write-Host "สำรอง Source PRODUCTION ก่อนอัปเดตแล้ว: $sourceBackup" -ForegroundColor Green
}

New-Item -ItemType Directory -Force -Path $targetRoot | Out-Null

$targetEnv=Join-Path $targetRoot '.env'
if(Test-Path -LiteralPath $targetEnv){
  $values=@{}
  Get-Content -LiteralPath $targetEnv | ForEach-Object {if($_ -match '^([^#=]+)=(.*)$'){$values[$matches[1].Trim().Trim([char]0xFEFF)]=$matches[2]}}
  $found=if($values.APP_ENV){$values.APP_ENV.ToLowerInvariant()}else{'production'}
  if($found -ne 'production'){
    Start-ExistingServerIfPossible -Root $targetRoot
    throw "Production-only deploy: APP_ENV ต้องเป็น production"
  }
  if($values.PGDATABASE -and ([string]$values.PGDATABASE).Trim() -ne 'health_check_smart_search'){
    Start-ExistingServerIfPossible -Root $targetRoot
    throw "Production-only deploy: PGDATABASE ต้องเป็น health_check_smart_search"
  }
  if($values.PORT -and [int]$values.PORT -ne 3000){
    Start-ExistingServerIfPossible -Root $targetRoot
    throw "Production-only deploy: PORT ต้องเป็น 3000"
  }
}

# Copy deployment files with directory-level exclusions.  This avoids walking
# the live GUI installer's own logs/status files and is resilient to transient
# file handles. Existing .env/API keys/database connection files are preserved.
try {
  Write-Host "Deploying application files to $targetRoot ..."
  Invoke-RobocopySafe -Source $sourceRoot -Destination $targetRoot -ExcludeDirs @(
    (Join-Path $sourceRoot '.git'),
    (Join-Path $sourceRoot 'release'),
    (Join-Path $sourceRoot 'node_modules'),
    (Join-Path $sourceRoot 'logs'),
    (Join-Path $sourceRoot 'backups'),
    (Join-Path $sourceRoot 'tmp')
  ) -ExcludeFiles @(
    '.env',
    'API-KEY.txt',
    'DATABASE-CONNECTION.txt',
    'LOCAL-SERVER.txt'
  )
} catch {
  Start-ExistingServerIfPossible -Root $targetRoot
  throw
}

$installer=Join-Path $targetRoot 'tools\install.ps1'
if(-not(Test-Path -LiteralPath $installer)){throw 'คัดลอกไฟล์ติดตั้งไม่ครบ'}
Write-Host "Starting database/dependency installation. Existing settings are preserved."
& $installer
if(-not $?){throw "$displayName core installer did not complete successfully."}
Write-Host "$displayName ติดตั้งสำเร็จที่ $targetRoot" -ForegroundColor Green
