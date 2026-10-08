$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
$envFile=Join-Path $root '.env'
if(Test-Path $envFile){Get-Content $envFile|ForEach-Object{if($_ -match '^\s*([^#][A-Za-z0-9_]+)=(.*)$'){[Environment]::SetEnvironmentVariable($matches[1],$matches[2].Trim('"'),'Process')}}}
$psql=Get-Command psql -ErrorAction SilentlyContinue;if(-not $psql){throw 'ไม่พบ psql'}
$sql=Join-Path $root 'migrations\0110_scalable_customer_emr.down.sql'
$args=@('-v','ON_ERROR_STOP=1','-f',$sql)
if($env:PGHOST){$args+=@('-h',$env:PGHOST)};if($env:PGPORT){$args+=@('-p',$env:PGPORT)};if($env:PGUSER){$args+=@('-U',$env:PGUSER)};if($env:PGDATABASE){$args+=$env:PGDATABASE}else{throw 'ไม่พบ PGDATABASE'}
& $psql @args
if($LASTEXITCODE -ne 0){throw "Rollback 0110 failed code=$LASTEXITCODE"}
Write-Host 'Rollback 0110 complete. Data columns/tables are intentionally retained to avoid destructive rollback.'
