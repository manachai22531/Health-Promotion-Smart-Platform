param(
  [Parameter(Mandatory=$true)][string]$LogFile,
  [Parameter(Mandatory=$true)][string]$StatusFile,
  [string]$PgCredentialFile=''
)
$ErrorActionPreference='Stop'
$sourceRoot=Split-Path -Parent $PSScriptRoot
$version='v7.65.00'
try {
  $pkgPath=Join-Path $sourceRoot 'package.json'
  if(Test-Path -LiteralPath $pkgPath){
    $pkg=Get-Content -LiteralPath $pkgPath -Raw | ConvertFrom-Json
    if($pkg.version){$version='v'+([string]$pkg.version).TrimStart('v')}
  }
} catch {}
$envName='production'
$targetRoot='D:\HealthCheck\Production'
$port=3000

function Add-LineShared([string]$Path,[string]$Text) {
  $parent=Split-Path -Parent $Path
  if($parent){New-Item -ItemType Directory -Force -Path $parent | Out-Null}
  $encoding=New-Object System.Text.UTF8Encoding($false)
  $last=$null
  for($attempt=1;$attempt -le 20;$attempt++){
    $stream=$null;$writer=$null
    try {
      $share=[System.IO.FileShare]([int][System.IO.FileShare]::ReadWrite -bor [int][System.IO.FileShare]::Delete)
      $stream=New-Object System.IO.FileStream -ArgumentList @($Path,[System.IO.FileMode]::Append,[System.IO.FileAccess]::Write,$share)
      $writer=New-Object System.IO.StreamWriter($stream,$encoding)
      $writer.WriteLine($Text)
      $writer.Flush()
      return
    } catch {
      $last=$_.Exception
      Start-Sleep -Milliseconds ([Math]::Min(500,25*$attempt))
    } finally {
      if($writer){$writer.Dispose()} elseif($stream){$stream.Dispose()}
    }
  }
  if($last){throw "Unable to append installer runtime file '$Path' after retries: $($last.Message)"}
}
function Write-Log([string]$Message,[string]$Level='INFO') {
  $line="[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] [$Level] $Message"
  Add-LineShared -Path $LogFile -Text $line
  Write-Host $line
}
function Emit([string]$Stage,[string]$State,[string]$Message='') {
  $obj=[ordered]@{time=(Get-Date).ToString('o');environment='production';stage=$Stage;state=$State;message=$Message}
  Add-LineShared -Path $StatusFile -Text ($obj|ConvertTo-Json -Compress)
  Write-Log "production / $Stage : $State $Message"
}
function Test-PayloadIntegrity([string]$Root) {
  $manifest=Join-Path $Root 'SOURCE-MANIFEST-SHA256.txt'
  if(-not(Test-Path -LiteralPath $manifest)){throw 'Payload SHA256 manifest is missing.'}
  $prefix=[IO.Path]::GetFullPath($Root).TrimEnd([IO.Path]::DirectorySeparatorChar)+[IO.Path]::DirectorySeparatorChar
  $count=0
  foreach($line in [IO.File]::ReadAllLines($manifest,[Text.Encoding]::UTF8)){
    if([string]::IsNullOrWhiteSpace($line)){continue}
    $entry=[regex]::Match($line,'^([a-fA-F0-9]{64})  (.+)$')
    if(-not $entry.Success){throw 'Invalid payload manifest entry.'}
    $relative=$entry.Groups[2].Value
    if([IO.Path]::IsPathRooted($relative)){throw 'Absolute manifest paths are not allowed.'}
    $file=[IO.Path]::GetFullPath((Join-Path $Root $relative.Replace([char]'/',[IO.Path]::DirectorySeparatorChar)))
    if(-not $file.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase)){throw 'Manifest path escapes the payload folder.'}
    if(-not(Test-Path -LiteralPath $file -PathType Leaf)){throw "Payload file is missing: $relative"}
    $actual=(Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash
    if($actual -ine $entry.Groups[1].Value){throw "Payload checksum mismatch: $relative"}
    $count++
  }
  if($count -eq 0){throw 'Payload manifest is empty.'}
  Write-Log "Payload SHA256 manifest verified: $count files"
}

function Test-PortOwner {
  try{$listener=Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction Stop|Select-Object -First 1}catch{return @{ok=$true;message='free'}}
  if(-not $listener){return @{ok=$true;message='free'}}
  $listenerProcessId=[int]$listener.OwningProcess

  # An upgrade is expected to find the currently-running Production server on
  # port 3000.  Older launchers may start Node with a relative `server.js`
  # command line, so path matching alone is not reliable.  Verify the live
  # application identity first and allow the installer to continue when the
  # listener is the Health Check Production instance.
  try {
    $v=Invoke-RestMethod -Uri 'http://127.0.0.1:3000/api/version' -TimeoutSec 2 -ErrorAction Stop
    if([string]$v.environment -eq 'production'){
      return @{ok=$true;message="existing production server detected on port $port (PID $listenerProcessId)"}
    }
  } catch {}

  $p=Get-CimInstance Win32_Process -Filter "ProcessId = $listenerProcessId" -ErrorAction SilentlyContinue
  if($p -and $p.Name -ieq 'node.exe' -and ([string]$p.CommandLine).IndexOf($targetRoot,[StringComparison]::OrdinalIgnoreCase)-ge 0){
    return @{ok=$true;message="existing production node detected on port $port (PID $listenerProcessId)"}
  }
  return @{ok=$false;message="port $port is used by another process PID $listenerProcessId"}
}
function Preflight {
  Emit 'Preflight' 'RUNNING'
  . (Join-Path $PSScriptRoot 'assert-no-downgrade.ps1')
  Assert-NoApplicationDowngrade -SourceRoot $sourceRoot -TargetRoot $targetRoot
  if(-not(Test-Path 'D:\')){throw 'Drive D: is required by the current deployment layout.'}
  New-Item -ItemType Directory -Force -Path 'D:\HealthCheck'|Out-Null
  $probe='D:\HealthCheck\.installer-write-test'; 'ok'|Set-Content -LiteralPath $probe -Encoding ASCII; Remove-Item $probe -Force
  $targetEnv=Join-Path $targetRoot '.env'
  if(Test-Path -LiteralPath $targetEnv){
    $cfg=@{}
    Get-Content -LiteralPath $targetEnv | ForEach-Object {if($_ -match '^([^#=]+)=(.*)$'){$cfg[$matches[1].Trim().Trim([char]0xFEFF)]=$matches[2].Trim()}}
    if($cfg.APP_ENV -and ([string]$cfg.APP_ENV).ToLowerInvariant() -ne 'production'){throw 'Production-only preflight: APP_ENV ต้องเป็น production'}
    if($cfg.PGDATABASE -and ([string]$cfg.PGDATABASE).Trim() -ne 'health_check_smart_search'){throw 'Production-only preflight: PGDATABASE ต้องเป็น health_check_smart_search'}
    if($cfg.PORT -and [int]$cfg.PORT -ne 3000){throw 'Production-only preflight: PORT ต้องเป็น 3000'}
  }
  $node=(Get-Command node.exe -ErrorAction SilentlyContinue).Source
  $psql=(Get-Command psql.exe -ErrorAction SilentlyContinue).Source
  if(-not $psql){$psql=(Get-ChildItem 'C:\Program Files\PostgreSQL\*\bin\psql.exe' -ErrorAction SilentlyContinue|Sort-Object FullName -Descending|Select-Object -First 1).FullName}
  $pgdump=(Get-Command pg_dump.exe -ErrorAction SilentlyContinue).Source
  if(-not $pgdump){$pgdump=(Get-ChildItem 'C:\Program Files\PostgreSQL\*\bin\pg_dump.exe' -ErrorAction SilentlyContinue|Sort-Object FullName -Descending|Select-Object -First 1).FullName}
  Write-Log "Node.js: $(if($node){$node}else{'not found; application installer will attempt installation'})"
  Write-Log "PostgreSQL psql: $(if($psql){$psql}else{'not found; application installer will attempt installation'})"
  Write-Log "PostgreSQL pg_dump: $(if($pgdump){$pgdump}else{'not found; application installer will attempt installation'})"
  $po=Test-PortOwner
  if(-not $po.ok){throw $po.message}
  Emit 'Preflight' 'SUCCESS' $po.message
}
function Wait-Health {
  Emit 'Health Check' 'RUNNING' "Expecting $version production on port 3000"
  $deadline=(Get-Date).AddSeconds(75)
  $lastError=''
  $lastObserved=''
  while((Get-Date)-lt $deadline){
    try {
      $r=Invoke-RestMethod -Uri 'http://127.0.0.1:3000/api/version' -TimeoutSec 3 -ErrorAction Stop
      $seenVersion=[string]$r.version
      $seenEnvironment=([string]$r.environment).ToLowerInvariant()
      $lastObserved="version=$seenVersion environment=$seenEnvironment"
      if($seenVersion -eq $version -and $seenEnvironment -eq 'production'){
        try {
          $h=Invoke-RestMethod -Uri 'http://127.0.0.1:3000/api/health' -TimeoutSec 4 -ErrorAction Stop
          if($h.ok -eq $true -and [string]$h.database -eq 'PostgreSQL'){
            Emit 'Health Check' 'SUCCESS' "http://localhost:3000 | $lastObserved | database=ok"
            return
          }
          $lastError='API version is correct but database health is not OK yet.'
        } catch {
          # Public readiness includes a database query without bypassing staff login.
          $lastError="Version API is ready; system health pending: $($_.Exception.Message)"
        }
      } else {
        $lastError="Version mismatch. Expected $version production; observed $lastObserved"
      }
    } catch {
      $lastError=$_.Exception.Message
    }
    Start-Sleep -Milliseconds 1000
  }
  if(-not $lastError){$lastError='No response from /api/version'}
  Write-Log "Health check final diagnostic: expected=$version production; observed=$lastObserved; error=$lastError" 'ERROR'
  throw "Health check failed for production on port 3000. $lastError"
}
function Invoke-DeployChild {
  param([Parameter(Mandatory=$true)][string]$ScriptPath,[Parameter(Mandatory=$true)][string]$EnvironmentName)
  $psi=New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName=(Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe')
  $escapedPath=$ScriptPath.Replace('"','\"')
  $psi.Arguments="-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$escapedPath`" -Environment $EnvironmentName"
  $psi.WorkingDirectory=Split-Path -Parent (Split-Path -Parent $ScriptPath)
  $psi.UseShellExecute=$false
  $psi.CreateNoWindow=$true
  $psi.RedirectStandardOutput=$true
  $psi.RedirectStandardError=$true
  $psi.RedirectStandardInput=$true
  $process=New-Object System.Diagnostics.Process
  $process.StartInfo=$psi
  try {
    if(-not $process.Start()){throw "Could not start $EnvironmentName deployment."}
    $process.StandardInput.Close()
    Write-Log "Deployment started (PID $($process.Id)). Progress follows live; large backups may take several minutes."
    $stdoutTask=$process.StandardOutput.ReadLineAsync()
    $stderrTask=$process.StandardError.ReadLineAsync()
    $started=[Diagnostics.Stopwatch]::StartNew()
    $lastHeartbeat=0
    $exitObserved=$null
    while($true){
      foreach($streamName in @('stdout','stderr')){
        $task=if($streamName -eq 'stdout'){$stdoutTask}else{$stderrTask}
        # Bound each batch so a noisy stream cannot starve the other stream.
        for($batch=0;$batch -lt 100 -and $null -ne $task -and $task.IsCompleted;$batch++){
          $line=$task.GetAwaiter().GetResult()
          if($null -eq $line){$task=$null;break}
          if($line){Write-Log $line}
          $task=if($streamName -eq 'stdout'){$process.StandardOutput.ReadLineAsync()}else{$process.StandardError.ReadLineAsync()}
        }
        if($streamName -eq 'stdout'){$stdoutTask=$task}else{$stderrTask=$task}
      }
      if($process.HasExited){
        if($null -eq $exitObserved){$exitObserved=$started.Elapsed.TotalSeconds}
        if(($null -eq $stdoutTask -and $null -eq $stderrTask) -or ($started.Elapsed.TotalSeconds-$exitObserved -ge 2)){break}
      } elseif($started.Elapsed.TotalSeconds-$lastHeartbeat -ge 15){
        $lastHeartbeat=$started.Elapsed.TotalSeconds
        Write-Log ("Deployment still running (PID {0}, elapsed {1}s). See the latest step above; do not start a second installer." -f $process.Id,[int]$lastHeartbeat)
      }
      Start-Sleep -Milliseconds 100
    }
    $exitCode=$process.ExitCode
    Write-Log "Deployment process finished with exit code $exitCode."
    if($exitCode -ne 0){throw "Deploy $EnvironmentName failed with exit code $exitCode. Review the final installer log lines above."}
  } finally {if($process){$process.Dispose()}}
}
function New-StagedPayload {
  $stageRoot=Join-Path 'D:\HealthCheck' ("HealthCheck-Production-Payload-"+(Get-Date -Format 'yyyyMMdd-HHmmss')+'-'+[Guid]::NewGuid().ToString('N').Substring(0,8))
  New-Item -ItemType Directory -Force -Path $stageRoot|Out-Null
  $args=@($sourceRoot,$stageRoot,'/E','/R:2','/W:1','/XJ','/COPY:DAT','/DCOPY:DAT','/NFL','/NDL','/NJH','/NJS','/NP','/XD',(Join-Path $sourceRoot 'logs'),(Join-Path $sourceRoot 'node_modules'),(Join-Path $sourceRoot 'backups'),(Join-Path $sourceRoot 'tmp'))
  & robocopy.exe @args | Out-Null
  if($LASTEXITCODE -gt 7){throw "Could not stage installer payload. Robocopy exit code $LASTEXITCODE"}
  if(-not(Test-Path (Join-Path $stageRoot 'tools\deploy-environment.ps1'))){throw 'Staged installer payload is incomplete.'}
  Write-Log "Installer payload staged safely at $stageRoot"
  return $stageRoot
}

try{
  $env:HEALTH_CHECK_NONINTERACTIVE='1'
  if($PgCredentialFile){$env:HEALTH_CHECK_PG_ADMIN_SEC_FILE=$PgCredentialFile}
  $env:PGCONNECT_TIMEOUT='8'
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $LogFile)|Out-Null
  [System.IO.File]::WriteAllBytes($LogFile,[byte[]]@())
  [System.IO.File]::WriteAllBytes($StatusFile,[byte[]]@())
  Write-Log "Health Check Up Smart Search $version PRODUCTION Installer started."
  Write-Log 'Target: D:\HealthCheck\Production | Port 3000 | DB health_check_smart_search'
  # Refuse a payload whose API release does not match the installer label.
  $serverSource=Join-Path $sourceRoot 'server.js'
  if(-not(Test-Path -LiteralPath $serverSource)){throw 'Payload validation failed: server.js missing'}
  $serverText=[System.IO.File]::ReadAllText($serverSource)
  $releaseMatch=[regex]::Match($serverText, 'const\s+RELEASE_NAME\s*=\s*[\x27\x22](v[0-9.]+-production)[\x27\x22]')
  if(-not $releaseMatch.Success){throw 'Payload validation failed: RELEASE_NAME missing'}
  $expectedRelease=$version+'-production'
  if($releaseMatch.Groups[1].Value -ne $expectedRelease){throw "Payload version mismatch: installer=$expectedRelease server=$($releaseMatch.Groups[1].Value)"}
  Write-Log "Payload release verified: $expectedRelease"
  Test-PayloadIntegrity -Root $sourceRoot
  Preflight
  Emit 'Backup' 'RUNNING' 'Source and database backups are mandatory before upgrade.'
  Emit 'Deploy' 'RUNNING'
  $stagedPayload=New-StagedPayload
  $deploy=Join-Path $stagedPayload 'tools\deploy-environment.ps1'
  $env:HEALTH_CHECK_PERMANENT_BOOTSTRAP='1'
  try {
    Invoke-DeployChild -ScriptPath $deploy -EnvironmentName 'production'
  } finally {
    Remove-Item Env:HEALTH_CHECK_PERMANENT_BOOTSTRAP -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $stagedPayload -Recurse -Force -ErrorAction SilentlyContinue
  }
  Emit 'Backup' 'SUCCESS'
  Emit 'Deploy' 'SUCCESS'
  Emit 'Migrate' 'SUCCESS' 'Database installer/migrations completed.'
  Emit 'Start' 'RUNNING'
  $run=Join-Path $targetRoot 'tools\run.ps1'
  if(-not(Test-Path -LiteralPath $run)){throw "Launcher not found: $run"}
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $run *>&1 | ForEach-Object {Write-Log ([string]$_)}
  $runExitCode=$LASTEXITCODE
  if($runExitCode -ne 0){throw "Production launcher failed with exit code $runExitCode. Review D:\HealthCheck\Production\logs\launcher.log"}
  Emit 'Start' 'SUCCESS'
  Wait-Health
  Emit 'Complete' 'SUCCESS' 'Production installation completed successfully.'
  Remove-Item Env:HEALTH_CHECK_NONINTERACTIVE,Env:HEALTH_CHECK_PG_ADMIN_SEC_FILE,Env:PGCONNECT_TIMEOUT -ErrorAction SilentlyContinue
  exit 0
}catch{
  $msg=$_.Exception.Message
  Write-Log $msg 'ERROR'
  Emit 'Complete' 'FAILED' $msg
  Remove-Item Env:HEALTH_CHECK_NONINTERACTIVE,Env:HEALTH_CHECK_PG_ADMIN_SEC_FILE,Env:PGCONNECT_TIMEOUT -ErrorAction SilentlyContinue
  exit 1
}
