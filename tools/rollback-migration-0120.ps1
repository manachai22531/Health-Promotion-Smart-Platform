$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
$sql=Join-Path $root 'migrations\0120_package_reconciliation.down.sql'
if(-not (Test-Path $sql)){throw 'ไม่พบ rollback migration 0120'}
$envFile=Join-Path $root '.env'
if(Test-Path $envFile){Get-Content $envFile | ForEach-Object {if($_ -match '^\s*([^#][A-Za-z0-9_]+)=(.*)$'){[Environment]::SetEnvironmentVariable($matches[1],$matches[2].Trim('"'), 'Process')}}}
$psql=(Get-Command psql.exe -ErrorAction SilentlyContinue).Source
if(-not $psql){$psql='C:\Program Files\PostgreSQL\16\bin\psql.exe'}
$hostValue=if($env:PGHOST){$env:PGHOST}else{'127.0.0.1'}
$portValue=if($env:PGPORT){$env:PGPORT}else{'5432'}
& $psql -h $hostValue -p $portValue -U $env:PGUSER -d $env:PGDATABASE -v ON_ERROR_STOP=1 -f $sql
if($LASTEXITCODE -ne 0){throw 'Rollback migration 0120 failed'}
