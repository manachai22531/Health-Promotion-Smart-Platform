param([ValidateSet('production')][string]$Environment='production')
$ErrorActionPreference='Stop'
$sourceRoot=Split-Path -Parent $PSScriptRoot
$targetRoot='D:\HealthCheck\Production'
$displayName='PRODUCTION'

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
      & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $run *> $null
    }
  } catch {}
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

# Stop the exact environment BEFORE source backup.  v7.62.57 backed up while
# node.exe was still running, which could leave a file handle open and abort
# Compress-Archive/Copy-Item with "The process cannot access the file".
Stop-TargetServer -Root $targetRoot

# Back up the exact target environment before copying any application file.
# Logs, node_modules and generated backup folders are intentionally excluded.
if((Test-Path -LiteralPath $targetRoot) -and (Get-ChildItem -LiteralPath $targetRoot -Force -ErrorAction SilentlyContinue | Select-Object -First 1)){
  $backupRoot='D:\\HealthCheck\\Backups'
  New-Item -ItemType Directory -Force -Path $backupRoot | Out-Null
  $stamp=Get-Date -Format 'yyyyMMdd-HHmmss'
  $prefix='PRODUCTION'
  $backupVersion='unknown'
  try {
    $pkgPath=Join-Path $sourceRoot 'package.json'
    if(Test-Path -LiteralPath $pkgPath){$pkg=Get-Content -LiteralPath $pkgPath -Raw|ConvertFrom-Json;if($pkg.version){$backupVersion=([string]$pkg.version).TrimStart('v')}}
  } catch {}
  $sourceBackup=Join-Path $backupRoot ("$prefix-source-before-v$backupVersion-$stamp.zip")
  $tempBackup=Join-Path $env:TEMP ("HealthCheck-$prefix-$stamp")
  Remove-Item -LiteralPath $tempBackup -Recurse -Force -ErrorAction SilentlyContinue
  New-Item -ItemType Directory -Force -Path $tempBackup | Out-Null
  try {
    Invoke-RobocopySafe -Source $targetRoot -Destination $tempBackup -ExcludeDirs @(
      (Join-Path $targetRoot 'node_modules'),
      (Join-Path $targetRoot 'logs'),
      (Join-Path $targetRoot 'backups'),
      (Join-Path $targetRoot 'tmp')
    )
    Compress-Archive -Path (Join-Path $tempBackup '*') -DestinationPath $sourceBackup -CompressionLevel Fastest -Force
    if(-not(Test-Path -LiteralPath $sourceBackup) -or (Get-Item -LiteralPath $sourceBackup).Length -lt 1024){
      throw 'Source backup ZIP was not created correctly.'
    }
  } catch {
    # If backup fails, restore the previous service instead of leaving the
    # selected environment offline.
    Start-ExistingServerIfPossible -Root $targetRoot
    throw
  } finally {
    Remove-Item -LiteralPath $tempBackup -Recurse -Force -ErrorAction SilentlyContinue
  }
  Write-Host "สำรอง Source $prefix ก่อนอัปเดตแล้ว: $sourceBackup" -ForegroundColor Green
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
& $installer
if(-not $?){throw "$displayName core installer did not complete successfully."}
Write-Host "$displayName ติดตั้งสำเร็จที่ $targetRoot" -ForegroundColor Green
