$ErrorActionPreference = 'Stop'
$appRoot = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $appRoot '.env'
if (-not (Test-Path $envFile)) { throw ' ' }

Get-Content $envFile | ForEach-Object {
  if ($_ -match '^([^#=]+)=(.*)$') {
    [Environment]::SetEnvironmentVariable($matches[1], $matches[2], 'Process')
  }
}
$pgDump = Get-ChildItem 'C:\Program Files\PostgreSQL\*\bin\pg_dump.exe' -ErrorAction SilentlyContinue |
  Sort-Object FullName -Descending | Select-Object -First 1
if (-not $pgDump) { throw ' pg_dump.exe' }

$backupDir = Join-Path $appRoot 'backups'
New-Item -ItemType Directory -Force $backupDir | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$versionFile = Join-Path $appRoot 'VERSION.txt'
$version = if (Test-Path $versionFile) { (Get-Content $versionFile -Raw).Trim() } else { 'vUnknown' }
$version = ($version -replace '[^A-Za-z0-9._-]','_')
$output = Join-Path $backupDir "health-check-$version-$stamp.backup"
& $pgDump.FullName -h $env:PGHOST -p $env:PGPORT -U $env:PGUSER -d $env:PGDATABASE -Fc -f $output
if ($LASTEXITCODE -ne 0) { throw ' ' }
$psql = Get-ChildItem 'C:\Program Files\PostgreSQL\*\bin\psql.exe' -ErrorAction SilentlyContinue |
  Sort-Object FullName -Descending | Select-Object -First 1
if ($psql) {
  $backupAt = (Get-Date).ToUniversalTime().ToString('o')
  & $psql.FullName -h $env:PGHOST -p $env:PGPORT -U $env:PGUSER -d $env:PGDATABASE -c "INSERT INTO system_settings(key,value,updated_at) VALUES('last_backup_at','$backupAt',NOW()) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=NOW()" | Out-Null
}
Write-Host " : $output" -ForegroundColor Green
