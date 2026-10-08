$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $root '.env'
if (Test-Path $envFile) {
  Get-Content $envFile | ForEach-Object {
    if ($_ -match '^\s*([^#][A-Za-z0-9_]+)=(.*)$') { [Environment]::SetEnvironmentVariable($matches[1], $matches[2].Trim('"'), 'Process') }
  }
}
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupDir = Join-Path $root 'backups'
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
$sourceOut = Join-Path $backupDir "source-before-0110-$stamp.zip"
$items = Get-ChildItem $root -Force | Where-Object { $_.Name -notin @('backups','node_modules') }
Compress-Archive -Path $items.FullName -DestinationPath $sourceOut -CompressionLevel Fastest
$pgDump = Get-Command pg_dump -ErrorAction SilentlyContinue
if (-not $pgDump) { throw 'ไม่พบ pg_dump กรุณาตรวจสอบ PostgreSQL bin PATH ก่อน Migration' }
$dbOut = Join-Path $backupDir "database-before-0110-$stamp.backup"
$args = @('-Fc','-f',$dbOut)
if ($env:PGHOST) { $args += @('-h',$env:PGHOST) }
if ($env:PGPORT) { $args += @('-p',$env:PGPORT) }
if ($env:PGUSER) { $args += @('-U',$env:PGUSER) }
if ($env:PGDATABASE) { $args += $env:PGDATABASE } else { throw 'ไม่พบ PGDATABASE ใน .env' }
& $pgDump @args
if ($LASTEXITCODE -ne 0) { throw "pg_dump ไม่สำเร็จ code=$LASTEXITCODE" }
Write-Host "SOURCE_BACKUP=$sourceOut"
Write-Host "DATABASE_BACKUP=$dbOut"
