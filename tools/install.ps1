$ErrorActionPreference = 'Stop'
# v7.59.3 INSTALLER HOTFIX: resilient component installation with winget/direct/local fallbacks.
$appRoot = Split-Path -Parent $PSScriptRoot
$installerTemp = Join-Path $appRoot 'tmp'
if (-not (Test-Path -LiteralPath $installerTemp)) { New-Item -ItemType Directory -Path $installerTemp -Force | Out-Null }
$appPort = 3000
$appEnvironment = 'production'
$displayName = 'Health Check Smart Search'
$dbName = 'health_check_smart_search'
$patientApiUrl = 'https://qzh0pwepu2.execute-api.ap-southeast-1.amazonaws.com/prod/checkup/getpatientlist'
$patientInfoApiUrl = 'https://qzh0pwepu2.execute-api.ap-southeast-1.amazonaws.com/prod/checkup/patientinfo'
$dbUser = 'health_check_app'
$port = 5432
$env:PGCONNECT_TIMEOUT = '8'
$nonInteractiveInstaller = ($env:HEALTH_CHECK_NONINTERACTIVE -eq '1')
$envPath = Join-Path $appRoot '.env'
$existingConfig = @{}
$isUpgrade = Test-Path $envPath
if ($isUpgrade) {
  Get-Content $envPath | ForEach-Object {
    if ($_ -match '^([^#=]+)=(.*)$') { $existingConfig[$matches[1].Trim().Trim([char]0xFEFF)] = $matches[2] }
  }
  $existingEnvironment = if($existingConfig.APP_ENV){$existingConfig.APP_ENV.ToLowerInvariant()}else{'production'}
  if($existingEnvironment -ne 'production'){ throw 'Production-only installer: APP_ENV ต้องเป็น production' }
  if($existingConfig.PGDATABASE -and ([string]$existingConfig.PGDATABASE).Trim() -ne 'health_check_smart_search'){ throw 'Production-only installer: PGDATABASE ต้องเป็น health_check_smart_search' }
  if($existingConfig.PORT -and [int]$existingConfig.PORT -ne 3000){ throw 'Production-only installer: PORT ต้องเป็น 3000' }
  if ($existingConfig.PGUSER) { $dbUser = $existingConfig.PGUSER }
  if ($existingConfig.PGPORT) { $port = [int]$existingConfig.PGPORT }
}

function Test-IsAdministrator {
  $currentIdentity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($currentIdentity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Write-Step([string]$text) {
  Write-Host "`n== $text ==" -ForegroundColor Cyan
}

function Find-CommandPath([string]$name) {
  $command = Get-Command $name -ErrorAction SilentlyContinue
  if ($command) { return $command.Source }
  return $null
}

function Refresh-Path {
  $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' +
    [Environment]::GetEnvironmentVariable('Path', 'User')
}

function Assert-LastExit([string]$message) {
  if ($LASTEXITCODE -ne 0) { throw $message }
}

# Native psql writes NOTICE/WARNING text to stderr even when the SQL succeeds.
# With $ErrorActionPreference='Stop', Windows PowerShell 5.1 may convert that
# benign stderr text into NativeCommandError and abort the installer. Capture
# stderr as plain text and decide success only from psql's process exit code.
function Quote-NativeArgument {
  param([AllowNull()][string]$Value)
  if ($null -eq $Value) { return '""' }
  # Windows ProcessStartInfo.Arguments parsing follows CommandLineToArgvW-style
  # quoting. Escape backslashes that appear before quotes and wrap every
  # argument so SQL snippets, paths and spaces survive unchanged.
  $escaped = [regex]::Replace($Value, '(\\*)"', '$1$1\\"')
  $escaped = [regex]::Replace($escaped, '(\\+)$', '$1$1')
  return '"' + $escaped + '"'
}

# Windows PowerShell 5.1 can convert native stderr into ErrorRecord objects.
# PostgreSQL writes NOTICE/WARNING messages to stderr even when exit code = 0,
# so invoking psql directly under ErrorActionPreference=Stop can abort a valid
# migration. Run psql through System.Diagnostics.Process instead and decide
# success strictly from the native process ExitCode.
function Invoke-PsqlChecked {
  param(
    [Parameter(Mandatory=$true)][string[]]$Arguments,
    [Parameter(Mandatory=$true)][string]$FailureMessage
  )

  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $psqlPath
  $psi.UseShellExecute = $false
  $psi.CreateNoWindow = $true
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $psi.Arguments = (($Arguments | ForEach-Object { Quote-NativeArgument ([string]$_) }) -join ' ')

  $process = New-Object System.Diagnostics.Process
  $process.StartInfo = $psi
  try {
    if (-not $process.Start()) { throw $FailureMessage }
    $stdoutTask = $process.StandardOutput.ReadToEndAsync()
    $stderrTask = $process.StandardError.ReadToEndAsync()
    $process.WaitForExit()
    $stdout = $stdoutTask.GetAwaiter().GetResult()
    $stderr = $stderrTask.GetAwaiter().GetResult()
    $exitCode = $process.ExitCode

    if (-not [string]::IsNullOrWhiteSpace($stdout)) {
      $stdout -split "`r?`n" | ForEach-Object {
        if (-not [string]::IsNullOrWhiteSpace($_)) { Write-Host $_ }
      }
    }
    if (-not [string]::IsNullOrWhiteSpace($stderr)) {
      $stderr -split "`r?`n" | ForEach-Object {
        $line = [string]$_
        if ([string]::IsNullOrWhiteSpace($line)) { return }
        if ($line -match '(?i)(ERROR:|FATAL:|PANIC:)') {
          Write-Host $line -ForegroundColor Red
        } elseif ($line -match '(?i)(NOTICE:|WARNING:)') {
          Write-Host $line -ForegroundColor DarkGray
        } else {
          Write-Host $line -ForegroundColor DarkGray
        }
      }
    }

    if ($exitCode -ne 0) {
      $detail = if (-not [string]::IsNullOrWhiteSpace($stderr)) { ($stderr.Trim() -replace "`r?`n", ' | ') } else { "psql exit code $exitCode" }
      throw ("{0} {1}" -f $FailureMessage, $detail)
    }
  } finally {
    if ($process) { $process.Dispose() }
  }
}

function Download-VerifiedFile([string]$url, [string]$destination, [string]$sha256 = '') {
  Write-Host "Downloading $url"
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  $downloaded = $false
  $lastMessage = ''

  # First try Invoke-WebRequest with a browser-like User-Agent. Some CDNs reject
  # package-manager/default PowerShell user agents with HTTP 403.
  try {
    $headers = @{ 'User-Agent' = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 HealthCheckInstaller/7.59.1' }
    Invoke-WebRequest -Uri $url -OutFile $destination -UseBasicParsing -Headers $headers
    $downloaded = (Test-Path $destination) -and ((Get-Item $destination).Length -gt 1MB)
  } catch {
    $lastMessage = $_.Exception.Message
    Remove-Item $destination -Force -ErrorAction SilentlyContinue
    Write-Host "Direct web download failed: $lastMessage" -ForegroundColor Yellow
  }

  # curl.exe follows redirects differently and is a useful fallback on current Windows.
  if (-not $downloaded) {
    $curl = Find-CommandPath 'curl.exe'
    if ($curl) {
      try {
        Write-Host 'Retrying download with Windows curl...'
        & $curl -L --fail --retry 3 --retry-delay 2 -A 'Mozilla/5.0 HealthCheckInstaller/7.59.1' -o $destination $url
        if ($LASTEXITCODE -eq 0 -and (Test-Path $destination) -and ((Get-Item $destination).Length -gt 1MB)) {
          $downloaded = $true
        } else {
          Remove-Item $destination -Force -ErrorAction SilentlyContinue
        }
      } catch {
        $lastMessage = $_.Exception.Message
        Remove-Item $destination -Force -ErrorAction SilentlyContinue
      }
    }
  }

  # Last network attempt: Background Intelligent Transfer Service, when available.
  if (-not $downloaded) {
    try {
      $bits = Get-Command Start-BitsTransfer -ErrorAction SilentlyContinue
      if ($bits) {
        Write-Host 'Retrying download with Windows BITS...'
        Start-BitsTransfer -Source $url -Destination $destination -ErrorAction Stop
        $downloaded = (Test-Path $destination) -and ((Get-Item $destination).Length -gt 1MB)
      }
    } catch {
      $lastMessage = $_.Exception.Message
      Remove-Item $destination -Force -ErrorAction SilentlyContinue
    }
  }

  if (-not $downloaded) {
    throw "Download failed after Windows web/curl/BITS attempts: $url. $lastMessage"
  }

  if ($sha256) {
    $actual = (Get-FileHash -Path $destination -Algorithm SHA256).Hash.ToUpperInvariant()
    if ($actual -ne $sha256.ToUpperInvariant()) {
      Remove-Item $destination -Force -ErrorAction SilentlyContinue
      throw "Downloaded file checksum mismatch. Installation stopped for safety. Expected $sha256, got $actual."
    }
  }
}

function Find-LocalInstaller([string[]]$patterns) {
  $folders = @($appRoot, (Join-Path $appRoot 'installers'), $env:USERPROFILE + '\Downloads', $installerTemp)
  foreach ($folder in $folders) {
    if (-not $folder -or -not (Test-Path $folder)) { continue }
    foreach ($pattern in $patterns) {
      $candidate = Get-ChildItem -Path $folder -Filter $pattern -File -ErrorAction SilentlyContinue |
        Where-Object { $_.Length -gt 10MB } |
        Sort-Object LastWriteTime -Descending | Select-Object -First 1
      if ($candidate) { return $candidate.FullName }
    }
  }
  return $null
}

function Install-NodeWithoutWinget {
  if (-not [Environment]::Is64BitOperatingSystem) { throw 'This installer supports 64-bit Windows only.' }
  $tmp = Join-Path $installerTemp 'health-check-node-v24.13.1-x64.msi'
  $url = 'https://nodejs.org/dist/v24.13.1/node-v24.13.1-x64.msi'
  $sha = '03FE815E236AD8FB6FA4289921A746E1492571ACEE49105154F2CC0B07021515'
  Download-VerifiedFile $url $tmp $sha
  Write-Host 'Installing Node.js LTS without winget...'
  $proc = Start-Process -FilePath 'msiexec.exe' -ArgumentList @('/i', ('"' + $tmp + '"'), '/qn', '/norestart') -Wait -PassThru
  if ($proc.ExitCode -notin @(0, 3010, 1641)) { throw "Node.js installation failed (ExitCode $($proc.ExitCode))" }
  Remove-Item $tmp -Force -ErrorAction SilentlyContinue
}

function Install-PostgresFromInstaller([string]$installerPath, [string]$password, [int]$serverPort) {
  if (-not (Test-Path $installerPath)) { throw "PostgreSQL installer not found: $installerPath" }
  Write-Host "Installing PostgreSQL from: $installerPath" -ForegroundColor Cyan
  $args = @('--mode','unattended','--unattendedmodeui','minimal','--superpassword',$password,'--serverport',"$serverPort")
  $proc = Start-Process -FilePath $installerPath -ArgumentList $args -Wait -PassThru
  if ($proc.ExitCode -ne 0) { throw "PostgreSQL installation failed (ExitCode $($proc.ExitCode))" }
}

function Install-PostgresWithoutWinget([string]$password, [int]$serverPort) {
  if (-not [Environment]::Is64BitOperatingSystem) { throw 'This installer supports 64-bit Windows only.' }

  # Prefer an already downloaded official installer. This also lets users recover
  # from corporate/firewall HTTP 403 blocks simply by placing the EDB installer
  # beside INSTALL-REPAIR.bat or in Downloads and running repair again.
  $localInstaller = Find-LocalInstaller @('postgresql-17*-windows-x64.exe', 'postgresql-16*-windows-x64.exe')
  if ($localInstaller) {
    Write-Host 'Found a local PostgreSQL installer; using it instead of downloading again.' -ForegroundColor Green
    Install-PostgresFromInstaller $localInstaller $password $serverPort
    return
  }

  $tmp = Join-Path $installerTemp 'health-check-postgresql-17.11-1-windows-x64.exe'
  $urls = @(
    'https://get.enterprisedb.com/postgresql/postgresql-17.11-1-windows-x64.exe',
    'https://get.enterprisedb.com/postgresql/postgresql-17.10-2-windows-x64.exe'
  )
  $checksums = @{
    'https://get.enterprisedb.com/postgresql/postgresql-17.11-1-windows-x64.exe' = 'F104C552D8495A6F20738C2A03F643164BC64B9985363329E314DEC24559F0B7'
  }

  $downloadError = $null
  foreach ($url in $urls) {
    try {
      Remove-Item $tmp -Force -ErrorAction SilentlyContinue
      $sha = if ($checksums.ContainsKey($url)) { $checksums[$url] } else { '' }
      Download-VerifiedFile $url $tmp $sha
      Install-PostgresFromInstaller $tmp $password $serverPort
      Remove-Item $tmp -Force -ErrorAction SilentlyContinue
      return
    } catch {
      $downloadError = $_.Exception.Message
      Write-Host "PostgreSQL fallback failed for $url" -ForegroundColor Yellow
      Write-Host $downloadError -ForegroundColor DarkYellow
      Remove-Item $tmp -Force -ErrorAction SilentlyContinue
    }
  }

  throw @"
PostgreSQL could not be downloaded automatically. Your network/CDN returned an error (often HTTP 403).

Recovery without changing any application data:
1) Download the official PostgreSQL 17 Windows x64 installer from https://www.postgresql.org/download/windows/
2) Save the EXE in this application folder, an 'installers' subfolder, or your Downloads folder.
3) Run INSTALL-REPAIR.bat again. The installer will detect and use that EXE automatically.

Last download error: $downloadError
"@
}

function Install-NodeResilient {
  $winget = Find-CommandPath 'winget.exe'
  if ($winget) {
    Write-Host 'Installing Node.js LTS with winget...'
    winget install --id OpenJS.NodeJS.LTS --exact --silent --accept-package-agreements --accept-source-agreements
    if ($LASTEXITCODE -eq 0) { return }
    Write-Host "winget Node.js install failed (ExitCode $LASTEXITCODE). Falling back to verified direct download..." -ForegroundColor Yellow
  } else {
    Write-Host 'winget was not found. Using the verified Node.js direct download instead.' -ForegroundColor Yellow
  }
  Install-NodeWithoutWinget
}

function Install-PostgresResilient([string]$password, [int]$serverPort) {
  $winget = Find-CommandPath 'winget.exe'
  if ($winget) {
    Write-Host 'Installing PostgreSQL 17 with winget. This may take several minutes...'
    $override = "--mode unattended --unattendedmodeui minimal --superpassword `"$password`" --serverport $serverPort"
    winget install --id PostgreSQL.PostgreSQL.17 --exact --silent --accept-package-agreements --accept-source-agreements --override $override
    if ($LASTEXITCODE -eq 0) { return }
    Write-Host "winget PostgreSQL install failed (ExitCode $LASTEXITCODE). Trying fallback methods automatically..." -ForegroundColor Yellow
  } else {
    Write-Host 'winget was not found. Trying PostgreSQL fallback methods...' -ForegroundColor Yellow
  }
  Install-PostgresWithoutWinget $password $serverPort
}

function Set-EnvValue([string]$key, [string]$value) {
  $lines = if (Test-Path $envPath) { @(Get-Content $envPath) } else { @() }
  $updated = $false
  $output = foreach ($line in $lines) {
    if ($line -match "^$([Regex]::Escape($key))=") {
      if (-not $updated) { "$key=$value"; $updated = $true }
    } else { $line }
  }
  if (-not $updated) { $output += "$key=$value" }
  $output | Set-Content $envPath -Encoding UTF8
}

function Remove-EnvValue([string]$key) {
  if (-not (Test-Path $envPath)) { return }
  @(Get-Content $envPath) | Where-Object { $_ -notmatch "^$([Regex]::Escape($key))=" } | Set-Content $envPath -Encoding UTF8
}

function Get-InstallerCredentialPath {
  $dir = Join-Path $env:ProgramData 'HealthCheckUpSmartSearch'
  New-Item -ItemType Directory -Force $dir | Out-Null
  return (Join-Path $dir 'postgres-admin.sec')
}

function Get-ProvidedPostgresAdminPassword {
  try {
    $path = $env:HEALTH_CHECK_PG_ADMIN_SEC_FILE
    if ([string]::IsNullOrWhiteSpace($path) -or -not (Test-Path -LiteralPath $path)) { return $null }
    $encrypted = (Get-Content -LiteralPath $path -Raw -ErrorAction Stop).Trim()
    if ([string]::IsNullOrWhiteSpace($encrypted)) { return $null }
    if ($encrypted.StartsWith('DPAPI-MACHINE:')) {
      Add-Type -AssemblyName System.Security -ErrorAction SilentlyContinue
      $blob = [Convert]::FromBase64String($encrypted.Substring(14))
      $plainBytes = [Security.Cryptography.ProtectedData]::Unprotect($blob, $null, [Security.Cryptography.DataProtectionScope]::LocalMachine)
      return [Text.Encoding]::UTF8.GetString($plainBytes)
    }
    $secure = ConvertTo-SecureString $encrypted
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringAuto($ptr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
  } catch { return $null }
}

function Get-StoredPostgresAdminPassword {
  try {
    $path = Get-InstallerCredentialPath
    if (-not (Test-Path $path)) { return $null }
    $encrypted = Get-Content $path -Raw
    if ([string]::IsNullOrWhiteSpace($encrypted)) { return $null }
    $secure = ConvertTo-SecureString $encrypted
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringAuto($ptr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
  } catch { return $null }
}

function Save-PostgresAdminPassword([string]$password) {
  if ([string]::IsNullOrWhiteSpace($password)) { return }
  $secure = ConvertTo-SecureString $password -AsPlainText -Force
  $secure | ConvertFrom-SecureString | Set-Content (Get-InstallerCredentialPath) -Encoding ASCII
}

function Prompt-PostgresAdminPassword {
  if ($nonInteractiveInstaller) {
    throw 'PostgreSQL administrator password is required. Re-run the GUI installer and enter the postgres password in the PostgreSQL admin password field.'
  }
  $secureAdminPassword = Read-Host 'Enter the PostgreSQL administrator (postgres) password' -AsSecureString
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureAdminPassword)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringAuto($ptr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}

function Stop-ExistingAppServers {
  $normalizedRoot = $appRoot.TrimEnd('\')
  $portOwnerIds = @()
  try {
    $portOwnerIds = @(Get-NetTCPConnection -LocalPort $appPort -State Listen -ErrorAction Stop |
      Select-Object -ExpandProperty OwningProcess -Unique)
  } catch {
    # Older Windows builds may not provide Get-NetTCPConnection. The path and
    # command-line checks below remain as the safe fallback.
  }
  $appProcesses = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
    Where-Object {
      $_.CommandLine -and
      $_.CommandLine -match '(?i)(^|[\\/"\s])server\.js([\"\s]|$)' -and
      (
        $_.CommandLine.IndexOf($normalizedRoot, [StringComparison]::OrdinalIgnoreCase) -ge 0 -or
        $portOwnerIds -contains [uint32]($_.ProcessId)
      )
    }

  foreach ($appProcess in $appProcesses) {
    Write-Host "Stopping the existing application server (PID $($appProcess.ProcessId))..."
    Stop-Process -Id $appProcess.ProcessId -Force -ErrorAction SilentlyContinue
  }

  if ($appProcesses) {
    foreach ($appProcess in $appProcesses) {
      Wait-Process -Id $appProcess.ProcessId -Timeout 5 -ErrorAction SilentlyContinue
    }
    Start-Sleep -Milliseconds 500
  }
}

Write-Host 'Health Check Up Smart Search - Install and Repair' -ForegroundColor Green
Write-Host 'The installer will prepare required components, database, and shortcuts.'

if (-not (Test-IsAdministrator)) {
  throw 'Administrator permission is required. Run INSTALL-REPAIR.bat and approve the Windows prompt.'
}

Write-Step 'Stop existing application server'
Stop-ExistingAppServers

# Earlier packages contained two launchers that ran the same installer. Keep
# only the repair-capable launcher so the user has one clear entry point.
$legacyInstaller = Join-Path $appRoot 'ติดตั้งโปรแกรม.bat'
if (Test-Path $legacyInstaller) {
  Remove-Item $legacyInstaller -Force -ErrorAction SilentlyContinue
}

Write-Step 'Check Node.js'
$nodePath = Find-CommandPath 'node.exe'
if (-not $nodePath) {
  Install-NodeResilient
  Refresh-Path
  $nodePath = Find-CommandPath 'node.exe'
  if (-not $nodePath -and (Test-Path 'C:\Program Files\nodejs\node.exe')) {
    $nodePath = 'C:\Program Files\nodejs\node.exe'
  }
  if (-not $nodePath) { throw 'Node.js was installed but node.exe was not found. Restart Windows and run the installer again.' }
}

Write-Step 'Check PostgreSQL'
$psqlPath = Find-CommandPath 'psql.exe'
if (-not $psqlPath) {
  $candidate = Get-ChildItem 'C:\Program Files\PostgreSQL\*\bin\psql.exe' -ErrorAction SilentlyContinue |
    Sort-Object FullName -Descending | Select-Object -First 1
  if ($candidate) { $psqlPath = $candidate.FullName }
}

$adminPassword = Get-ProvidedPostgresAdminPassword
if ($adminPassword) {
  Write-Host 'Using the PostgreSQL administrator password supplied by the GUI installer.' -ForegroundColor Green
} else {
  $adminPassword = Get-StoredPostgresAdminPassword
  if ($adminPassword) {
    Write-Host 'Using the PostgreSQL administrator password saved securely on this Windows account.' -ForegroundColor Green
  } elseif ($isUpgrade -and $existingConfig.PGUSER -and $existingConfig.PGPASSWORD) {
    Write-Host 'No postgres administrator password was supplied. The installer will first try the existing application database credentials.' -ForegroundColor Yellow
  } elseif ($nonInteractiveInstaller) {
    throw 'PostgreSQL administrator password is required for a fresh install because no existing application database credentials are available.'
  } else {
    $adminPassword = Prompt-PostgresAdminPassword
    if ([string]::IsNullOrWhiteSpace($adminPassword)) { throw 'The PostgreSQL password cannot be empty.' }
  }
}


if (-not $psqlPath) {
  if ([string]::IsNullOrWhiteSpace($adminPassword)) {
    if ($nonInteractiveInstaller) { throw 'PostgreSQL must be installed or repaired, so the PostgreSQL administrator password is required.' }
    $adminPassword = Prompt-PostgresAdminPassword
  }
  Install-PostgresResilient $adminPassword $port
  Refresh-Path
  $candidate = Get-ChildItem 'C:\Program Files\PostgreSQL\*\bin\psql.exe' -ErrorAction SilentlyContinue |
    Sort-Object FullName -Descending | Select-Object -First 1
  if (-not $candidate) { throw 'PostgreSQL was installed but psql.exe was not found. Restart Windows and run the installer again.' }
  $psqlPath = $candidate.FullName
}

Write-Step 'Check PostgreSQL service'
$pgService = Get-Service -Name 'postgresql*' -ErrorAction SilentlyContinue |
  Sort-Object Name -Descending | Select-Object -First 1
if (-not $pgService) { throw 'PostgreSQL service was not found.' }
try {
  Set-Service -Name $pgService.Name -StartupType Automatic -ErrorAction Stop
} catch {
  throw "Could not configure the PostgreSQL service: $($_.Exception.Message)"
}
if ($pgService.Status -ne 'Running') {
  try {
    Start-Service -Name $pgService.Name -ErrorAction Stop
    $pgService.WaitForStatus('Running', (New-TimeSpan -Seconds 30))
  } catch {
    throw "Could not start the PostgreSQL service: $($_.Exception.Message)"
  }
}

# Prefer the saved/supplied postgres administrator credential, but do not
# require it for an existing healthy installation. Upgrades can safely use the
# application database account already stored in that environment's .env.
$adminConnected = $false
$appUpgradeConnected = $false
if (-not [string]::IsNullOrWhiteSpace($adminPassword)) {
  $env:PGPASSWORD = $adminPassword
  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    & $psqlPath -h 127.0.0.1 -p $port -U postgres -d postgres -tAc 'SELECT 1' 2>$null | Out-Null
  } finally { $ErrorActionPreference = $previousErrorActionPreference }
  $adminConnected = ($LASTEXITCODE -eq 0)
  if ($adminConnected) {
    Save-PostgresAdminPassword $adminPassword
    Write-Host 'PostgreSQL administrator credential verified.' -ForegroundColor Green
  } else {
    Write-Host 'The supplied/saved postgres administrator password could not be verified. Trying the existing application account for this upgrade.' -ForegroundColor Yellow
  }
}

if (-not $adminConnected -and $isUpgrade -and $existingConfig.PGUSER -and $existingConfig.PGPASSWORD) {
  $env:PGPASSWORD = [string]$existingConfig.PGPASSWORD
  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $probe = & $psqlPath -h 127.0.0.1 -p $port -U ([string]$existingConfig.PGUSER) -d $dbName -tAc 'SELECT 1' 2>$null
  } finally { $ErrorActionPreference = $previousErrorActionPreference }
  if ($LASTEXITCODE -eq 0 -and ($probe -match '1')) {
    $appUpgradeConnected = $true
    Write-Host "Existing application database credential verified for $dbName. Administrator password is not required for this upgrade." -ForegroundColor Green
  }
}

if (-not $adminConnected -and -not $appUpgradeConnected) {
  if ($nonInteractiveInstaller) {
    throw 'Database credentials could not be verified. Enter the PostgreSQL postgres password in the installer, or restore a valid .env for this environment.'
  }
  $adminPassword = Prompt-PostgresAdminPassword
  if ([string]::IsNullOrWhiteSpace($adminPassword)) { throw 'The PostgreSQL password cannot be empty.' }
  $env:PGPASSWORD = $adminPassword
  & $psqlPath -h 127.0.0.1 -p $port -U postgres -d postgres -tAc 'SELECT 1' | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Could not connect to PostgreSQL with the supplied postgres password. No database was changed.' }
  $adminConnected = $true
  Save-PostgresAdminPassword $adminPassword
}

if ($isUpgrade) {
  Write-Step 'Back up the existing database before upgrade'
  $pgDump = Get-ChildItem 'C:\Program Files\PostgreSQL\*\bin\pg_dump.exe' -ErrorAction SilentlyContinue | Sort-Object FullName -Descending | Select-Object -First 1
  if (-not $pgDump) { throw 'pg_dump.exe was not found, so the existing database cannot be backed up.' }
  $backupDir = Join-Path $appRoot 'backups'
  New-Item -ItemType Directory -Force $backupDir | Out-Null
  $backupStamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $backupOutput = Join-Path $backupDir "before-update-v7.62.75-$backupStamp.backup"
  if ($adminConnected) {
    $backupUser = 'postgres'; $env:PGPASSWORD = $adminPassword
  } else {
    $backupUser = [string]$existingConfig.PGUSER; $env:PGPASSWORD = [string]$existingConfig.PGPASSWORD
  }
  & $pgDump.FullName -h 127.0.0.1 -p $port -U $backupUser -d $dbName -Fc -f $backupOutput
  Assert-LastExit 'Database backup failed. Installation stopped to protect existing data.'
  Write-Host ("Existing database backup created with {0}: {1}" -f $backupUser, $backupOutput) -ForegroundColor Green
  Copy-Item $envPath (Join-Path $backupDir ".env-before-v7.62.75-$backupStamp.txt") -Force
}

Write-Step 'Create or repair application database'
$bytes = New-Object byte[] 24
$randomNumberGenerator = [Security.Cryptography.RandomNumberGenerator]::Create()
try {
  $randomNumberGenerator.GetBytes($bytes)
} finally {
  $randomNumberGenerator.Dispose()
}
$generatedAppPassword = [Convert]::ToBase64String($bytes).Replace('+','A').Replace('/','B').TrimEnd('=')
$appPassword = if ($isUpgrade -and $existingConfig.PGPASSWORD) { $existingConfig.PGPASSWORD } else { $generatedAppPassword }
$apiBytes = New-Object byte[] 32
$apiRandomNumberGenerator = [Security.Cryptography.RandomNumberGenerator]::Create()
try {
  $apiRandomNumberGenerator.GetBytes($apiBytes)
} finally {
  $apiRandomNumberGenerator.Dispose()
}
$generatedExternalApiKey = [Convert]::ToBase64String($apiBytes).Replace('+','-').Replace('/','_').TrimEnd('=')
$externalApiKey = if ($isUpgrade -and $existingConfig.EXTERNAL_API_KEY) { $existingConfig.EXTERNAL_API_KEY } else { $generatedExternalApiKey }
if ($adminConnected) {
  $env:PGPASSWORD = $adminPassword
  $roleExists = & $psqlPath -h 127.0.0.1 -p $port -U postgres -d postgres -tAc "SELECT 1 FROM pg_roles WHERE rolname='$dbUser'"
  Assert-LastExit 'Could not inspect the application database role.'
  if (-not ($roleExists -match '1')) {
    & $psqlPath -h 127.0.0.1 -p $port -U postgres -d postgres -v ON_ERROR_STOP=1 -c "CREATE ROLE $dbUser LOGIN PASSWORD '$appPassword'"
    Assert-LastExit 'Could not create the application database role.'
  } else {
    & $psqlPath -h 127.0.0.1 -p $port -U postgres -d postgres -v ON_ERROR_STOP=1 -c "ALTER ROLE $dbUser PASSWORD '$appPassword'"
    Assert-LastExit 'Could not update the application database role password.'
  }

  $dbExists = & $psqlPath -h 127.0.0.1 -p $port -U postgres -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$dbName'"
  if (-not ($dbExists -match '1')) {
    & $psqlPath -h 127.0.0.1 -p $port -U postgres -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE $dbName OWNER $dbUser"
    Assert-LastExit 'Could not create the application database.'
  }
  & $psqlPath -h 127.0.0.1 -p $port -U postgres -d $dbName -v ON_ERROR_STOP=1 -c "GRANT ALL ON SCHEMA public TO $dbUser"
  Assert-LastExit 'Could not grant schema permissions.'
  & $psqlPath -h 127.0.0.1 -p $port -U postgres -d postgres -v ON_ERROR_STOP=1 -c "GRANT CONNECT, CREATE ON DATABASE $dbName TO $dbUser"
  Assert-LastExit 'Could not grant database permissions.'
  & $psqlPath -h 127.0.0.1 -p $port -U postgres -d $dbName -v ON_ERROR_STOP=1 -c "GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO $dbUser; GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO $dbUser"
  Assert-LastExit 'Could not grant table/sequence permissions.'

  if ($dbUser -notmatch '^[A-Za-z_][A-Za-z0-9_]*$' -or $dbName -notmatch '^[A-Za-z_][A-Za-z0-9_]*$') { throw 'Unsafe PostgreSQL database or role name.' }
  Write-Step 'Repair database object ownership'
  & $psqlPath -h 127.0.0.1 -p $port -U postgres -d postgres -v ON_ERROR_STOP=1 -c "ALTER DATABASE $dbName OWNER TO $dbUser"
  Assert-LastExit 'Could not repair database ownership.'
  & $psqlPath -h 127.0.0.1 -p $port -U postgres -d $dbName -v ON_ERROR_STOP=1 -c "ALTER SCHEMA public OWNER TO $dbUser"
  Assert-LastExit 'Could not repair public schema ownership.'
  $ownershipStatements = & $psqlPath -h 127.0.0.1 -p $port -U postgres -d $dbName -At -v ON_ERROR_STOP=1 -c "SELECT format('ALTER %s %I.%I OWNER TO %I;',CASE c.relkind WHEN 'S' THEN 'SEQUENCE' WHEN 'v' THEN 'VIEW' WHEN 'm' THEN 'MATERIALIZED VIEW' ELSE 'TABLE' END,n.nspname,c.relname,'$dbUser') FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_roles o ON o.oid=c.relowner WHERE n.nspname='public' AND c.relkind IN ('r','p','S','v','m','f') AND o.rolname<>'$dbUser' AND NOT (c.relkind='S' AND EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid='pg_class'::regclass AND d.objid=c.oid AND d.refclassid='pg_class'::regclass AND d.deptype IN ('a','i'))) ORDER BY CASE WHEN c.relkind IN ('r','p','f') THEN 1 WHEN c.relkind IN ('v','m') THEN 2 ELSE 3 END,c.relname"
  Assert-LastExit 'Could not inspect database object ownership.'
  foreach ($ownershipStatement in @($ownershipStatements)) {
    if ([string]::IsNullOrWhiteSpace($ownershipStatement)) { continue }
    & $psqlPath -h 127.0.0.1 -p $port -U postgres -d $dbName -v ON_ERROR_STOP=1 -c $ownershipStatement
    Assert-LastExit "Could not repair ownership: $ownershipStatement"
  }
} elseif ($appUpgradeConnected) {
  Write-Host 'Skipping postgres-level role/ownership repair because the existing application account is valid. Database content will still be backed up and migrated.' -ForegroundColor Yellow
} else {
  throw 'PostgreSQL administrator access is required to create or repair the application database.'
}

if (-not $isUpgrade) {
@"
PGHOST=127.0.0.1
PGPORT=$port
PGDATABASE=$dbName
PGUSER=$dbUser
PGPASSWORD=$appPassword
PORT=$appPort
APP_ENV=$appEnvironment
HOST=0.0.0.0
ENABLE_LAN_ACCESS=1
EXTERNAL_API_KEY=$externalApiKey
PATIENT_API_URL=$patientApiUrl
PATIENT_API_KEY=
PATIENTINFO_API_URL=$patientInfoApiUrl
PATIENTINFO_API_KEY=
"@ | Set-Content (Join-Path $appRoot '.env') -Encoding UTF8
@"
Health Check Up Smart Search - External API
Base URL: http://localhost:$appPort/external-api/v1
API Key: $externalApiKey

Send this HTTP header:
X-API-Key: $externalApiKey

See API-README.txt for usage details.
"@ | Set-Content (Join-Path $appRoot 'API-KEY.txt') -Encoding UTF8
} else {
  Write-Step 'Repair database settings while preserving existing API settings'
  Remove-EnvValue 'DATABASE_URL'
  Set-EnvValue 'PGHOST' '127.0.0.1'
  Set-EnvValue 'PGPORT' ([string]$port)
  Set-EnvValue 'PGDATABASE' $dbName
  Set-EnvValue 'PGUSER' $dbUser
  Set-EnvValue 'PGPASSWORD' $appPassword
  Set-EnvValue 'PORT' ([string]$appPort)
  Set-EnvValue 'APP_ENV' $appEnvironment
  Set-EnvValue 'HOST' '0.0.0.0'
  Set-EnvValue 'ENABLE_LAN_ACCESS' '1'
  Remove-EnvValue 'LAN_ACCESS_USER'
  Remove-EnvValue 'LAN_ACCESS_PASSWORD'
  if (-not $existingConfig.PATIENT_API_URL) { Set-EnvValue 'PATIENT_API_URL' $patientApiUrl }
  if (-not $existingConfig.ContainsKey('PATIENT_API_KEY')) { Set-EnvValue 'PATIENT_API_KEY' '' }
  if (-not $existingConfig.PATIENTINFO_API_URL) { Set-EnvValue 'PATIENTINFO_API_URL' $patientInfoApiUrl }
  if (-not $existingConfig.ContainsKey('PATIENTINFO_API_KEY')) { Set-EnvValue 'PATIENTINFO_API_KEY' '' }
  Write-Host 'Existing API keys and settings were preserved; database credentials were repaired.' -ForegroundColor Green
}

@"
Health Check Up Smart Search - Local PostgreSQL Connection

Host: 127.0.0.1
Port: $port
Database: $dbName
Username: $dbUser
Password: $appPassword

DBeaver JDBC URL:
jdbc:postgresql://127.0.0.1:$port/$dbName

Security note: this file contains the local application database password.
Keep it on this computer only and do not send it to other people.
The same password is stored in .env as PGPASSWORD.
"@ | Set-Content (Join-Path $appRoot 'DATABASE-CONNECTION.txt') -Encoding UTF8
Write-Host 'Database connection details saved to DATABASE-CONNECTION.txt' -ForegroundColor Green

$env:PGPASSWORD = $appPassword
$connectionTest = & $psqlPath -h 127.0.0.1 -p $port -U $dbUser -d $dbName -tAc 'SELECT 1'
if ($LASTEXITCODE -ne 0 -or -not ($connectionTest -match '1')) {
  throw 'Application database connection test failed.'
}
Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
# Keep a verified postgres credential only in memory for installer schema work.
# Production databases can contain legacy objects owned by older roles; running
# DDL as the application role can therefore fail midway even after GRANT.
$migrationAdminPassword = if ($adminConnected) { $adminPassword } else { $null }
$adminPassword = $null

function Invoke-DatabaseMigration {
  param(
    [Parameter(Mandatory=$true)][string[]]$Arguments,
    [Parameter(Mandatory=$true)][string]$FailureMessage
  )
  $savedPassword = $env:PGPASSWORD
  try {
    if (-not [string]::IsNullOrWhiteSpace($migrationAdminPassword)) {
      $env:PGPASSWORD = $migrationAdminPassword
      $adminArgs = @('-h','127.0.0.1','-p',[string]$port,'-U','postgres','-d',$dbName)
      # Strip connection/user args supplied by callers, then execute the SQL
      # with the verified postgres administrator. This avoids legacy ownership
      # conflicts while keeping application runtime credentials unchanged.
      $tail = @()
      for ($i=0; $i -lt $Arguments.Count; $i++) {
        $a=[string]$Arguments[$i]
        if ($a -in @('-h','-p','-U','-d')) { $i++; continue }
        $tail += $a
      }
      Invoke-PsqlChecked -Arguments ($adminArgs + $tail) -FailureMessage $FailureMessage
      return
    }
    $env:PGPASSWORD = $appPassword
    Invoke-PsqlChecked -Arguments $Arguments -FailureMessage $FailureMessage
  } finally {
    if ($null -eq $savedPassword) { Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue }
    else { $env:PGPASSWORD = $savedPassword }
  }
}

function Repair-ApplicationOwnershipAfterMigration {
  if ([string]::IsNullOrWhiteSpace($migrationAdminPassword)) { return }
  $savedPassword = $env:PGPASSWORD
  try {
    $env:PGPASSWORD = $migrationAdminPassword
    $sql = "GRANT ALL ON SCHEMA public TO $dbUser; GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO $dbUser; GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO $dbUser; ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO $dbUser; ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO $dbUser;"
    Invoke-PsqlChecked -Arguments @('-h','127.0.0.1','-p',[string]$port,'-U','postgres','-d',$dbName,'-v','ON_ERROR_STOP=1','-c',$sql) -FailureMessage 'Could not finalize application database privileges after migration.'
  } finally {
    if ($null -eq $savedPassword) { Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue }
    else { $env:PGPASSWORD = $savedPassword }
  }
}

Write-Step 'Initialize database schema'
$schemaBootstrap = Join-Path $PSScriptRoot 'schema-bootstrap.sql'
if (-not (Test-Path $schemaBootstrap)) { throw 'Database schema bootstrap file is missing.' }
$env:PGPASSWORD = $appPassword
Invoke-DatabaseMigration -Arguments @('-h','127.0.0.1','-p',[string]$port,'-U',$dbUser,'-d',$dbName,'-v','ON_ERROR_STOP=1','-f',$schemaBootstrap) -FailureMessage 'Database schema initialization failed.'
# Keep older databases compatible with the current API configuration editor.
Invoke-DatabaseMigration -Arguments @('-h','127.0.0.1','-p',[string]$port,'-U',$dbUser,'-d',$dbName,'-v','ON_ERROR_STOP=1','-c',"ALTER TABLE package_api_config ADD COLUMN IF NOT EXISTS config_data JSONB NOT NULL DEFAULT '{}'::jsonb;") -FailureMessage 'Could not migrate API configuration schema.'
Repair-ApplicationOwnershipAfterMigration
Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue

# npm writes informational notices to stderr even when installation succeeds.
# Windows PowerShell 5.1 can convert native stderr into a terminating
# NativeCommandError when ErrorActionPreference is Stop. Run npm through a
# redirected child process and decide success only from the native exit code.
function Invoke-NpmCiChecked {
  param([Parameter(Mandatory=$true)][string]$WorkingDirectory)

  $npmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue
  if (-not $npmCommand) { $npmCommand = Get-Command npm -ErrorAction SilentlyContinue }
  if (-not $npmCommand) { throw 'npm was not found after Node.js installation.' }

  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $env:ComSpec
  if ([string]::IsNullOrWhiteSpace($psi.FileName)) { $psi.FileName = 'cmd.exe' }
  $npmPath = [string]$npmCommand.Source
  $escapedNpm = $npmPath.Replace('"','""')
  $psi.Arguments = ('/d /s /c ""{0}" ci --omit=dev"' -f $escapedNpm)
  $psi.WorkingDirectory = $WorkingDirectory
  $psi.UseShellExecute = $false
  $psi.CreateNoWindow = $true
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true

  $process = New-Object System.Diagnostics.Process
  $process.StartInfo = $psi
  try {
    if (-not $process.Start()) { throw 'Could not start npm dependency installation.' }
    $stdoutTask = $process.StandardOutput.ReadToEndAsync()
    $stderrTask = $process.StandardError.ReadToEndAsync()
    $process.WaitForExit()
    $stdout = $stdoutTask.GetAwaiter().GetResult()
    $stderr = $stderrTask.GetAwaiter().GetResult()
    $exitCode = $process.ExitCode

    if (-not [string]::IsNullOrWhiteSpace($stdout)) {
      $stdout -split "`r?`n" | ForEach-Object {
        if (-not [string]::IsNullOrWhiteSpace($_)) { Write-Host $_ }
      }
    }
    if (-not [string]::IsNullOrWhiteSpace($stderr)) {
      $stderr -split "`r?`n" | ForEach-Object {
        $line = [string]$_
        if ([string]::IsNullOrWhiteSpace($line)) { return }
        if ($line -match '(?i)(ERR!|ERROR|FATAL)') {
          Write-Host $line -ForegroundColor Red
        } else {
          # npm notice / npm warn are diagnostic output, not installer failure.
          Write-Host $line -ForegroundColor DarkGray
        }
      }
    }

    if ($exitCode -ne 0) {
      $detail = if (-not [string]::IsNullOrWhiteSpace($stderr)) { ($stderr.Trim() -replace "`r?`n", ' | ') } else { "npm exit code $exitCode" }
      throw ('Application dependency installation failed. {0}' -f $detail)
    }
  } finally {
    if ($process) { $process.Dispose() }
  }
}

Write-Step 'Install application dependencies'
if (-not (Test-Path (Join-Path $appRoot 'node_modules\express')) -or -not (Test-Path (Join-Path $appRoot 'node_modules\qrcode')) -or -not (Test-Path (Join-Path $appRoot 'node_modules\bwip-js')) -or -not (Test-Path (Join-Path $appRoot 'node_modules\pdf-lib')) -or -not (Test-Path (Join-Path $appRoot 'node_modules\@pdf-lib\fontkit'))) {
  Invoke-NpmCiChecked -WorkingDirectory $appRoot
} else {
  Write-Host 'Application dependencies are already installed.'
}

Write-Step 'Initialize administrator account'
Push-Location $appRoot
try {
  & $nodePath 'tools\repair-admin.js'
  if ($LASTEXITCODE -ne 0) { throw 'Administrator account initialization failed.' }
} finally { Pop-Location }

Write-Step 'Validate application server'
$env:PGHOST = '127.0.0.1'
$env:PGPORT = [string]$port
$env:PGDATABASE = $dbName
$env:PGUSER = $dbUser
$env:PGPASSWORD = $appPassword
$testPort = 39001
$env:PORT = [string]$testPort
$env:APP_ENV = $appEnvironment
$env:HEALTH_CHECK_INSTALL_TEST = '1'
$testOutput = Join-Path $installerTemp 'health-check-smart-search-install-test.log'
$testError = Join-Path $installerTemp 'health-check-smart-search-install-test-error.log'
Remove-Item -LiteralPath $testOutput -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $testError -Force -ErrorAction SilentlyContinue
$testProcess = Start-Process -FilePath $nodePath -ArgumentList 'server.js' -WorkingDirectory $appRoot `
  -WindowStyle Hidden -RedirectStandardOutput $testOutput -RedirectStandardError $testError -PassThru
$serverReady = $false
for ($attempt = 0; $attempt -lt 20; $attempt++) {
  Start-Sleep -Milliseconds 500
  try {
    $testHealth = Invoke-RestMethod -Uri "http://127.0.0.1:$testPort/api/health" -TimeoutSec 2
    if ($testHealth.ok) { $serverReady = $true; break }
  } catch {}
  if ($testProcess.HasExited) { break }
}
if (-not $testProcess.HasExited) { Stop-Process -Id $testProcess.Id -Force -ErrorAction SilentlyContinue }
Remove-Item Env:PGHOST,Env:PGPORT,Env:PGDATABASE,Env:PGUSER,Env:PGPASSWORD,Env:PORT,Env:APP_ENV,Env:HEALTH_CHECK_INSTALL_TEST -ErrorAction SilentlyContinue
if (-not $serverReady) {
  $testDetail = if (Test-Path $testOutput) {
    (Get-Content $testOutput -Tail 12 -ErrorAction SilentlyContinue) -join "`n"
  } else { '' }
  if (Test-Path $testError) {
    $testErrorDetail = (Get-Content $testError -Tail 12 -ErrorAction SilentlyContinue) -join "`n"
    if (-not [string]::IsNullOrWhiteSpace($testErrorDetail)) { $testDetail = $testErrorDetail }
  }
  if ([string]::IsNullOrWhiteSpace($testDetail)) { $testDetail = 'The test server did not respond.' }
  throw "Server validation failed: $testDetail"
}

Write-Step 'Apply scalable relational migration'
$migration0110 = Join-Path $appRoot 'migrations\0110_scalable_customer_emr.up.sql'
if (Test-Path -LiteralPath $migration0110) {
  $env:PGPASSWORD = $appPassword
  Invoke-DatabaseMigration -Arguments @('-h','127.0.0.1','-p',[string]$port,'-U',$dbUser,'-d',$dbName,'-v','ON_ERROR_STOP=1','-f',$migration0110) -FailureMessage 'Scalability migration 0110 failed.'
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
} else {
  throw 'Scalability migration 0110 is missing from the installer package.'
}

Write-Step 'Apply Package HIS reconciliation migration'
$migration0120 = Join-Path $appRoot 'migrations\0120_package_reconciliation.up.sql'
if (Test-Path -LiteralPath $migration0120) {
  $env:PGPASSWORD = $appPassword
  Invoke-DatabaseMigration -Arguments @('-h','127.0.0.1','-p',[string]$port,'-U',$dbUser,'-d',$dbName,'-v','ON_ERROR_STOP=1','-f',$migration0120) -FailureMessage 'Package reconciliation migration 0120 failed.'
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
} else {
  throw 'Package reconciliation migration 0120 is missing from the installer package.'
}

Write-Step 'Apply Package Station migration'
$migration0140 = Join-Path $appRoot 'migrations\0140_package_station.up.sql'
if (Test-Path -LiteralPath $migration0140) {
  $env:PGPASSWORD = $appPassword
  Invoke-DatabaseMigration -Arguments @('-h','127.0.0.1','-p',[string]$port,'-U',$dbUser,'-d',$dbName,'-v','ON_ERROR_STOP=1','-f',$migration0140) -FailureMessage 'Package Station migration 0140 failed.'
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
} else {
  throw 'Package Station migration 0140 is missing from the installer package.'
}

Write-Step 'Apply Package Station seed/editor fix migration'
$migration0141 = Join-Path $appRoot 'migrations\0141_package_station_seed_fix.up.sql'
if (Test-Path -LiteralPath $migration0141) {
  $env:PGPASSWORD = $appPassword
  Invoke-DatabaseMigration -Arguments @('-h','127.0.0.1','-p',[string]$port,'-U',$dbUser,'-d',$dbName,'-v','ON_ERROR_STOP=1','-f',$migration0141) -FailureMessage 'Package Station migration 0141 failed.'
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
} else {
  throw 'Package Station migration 0141 is missing from the installer package.'
}


$migration0160 = Join-Path $appRoot 'migrations\0160_package_item_settings.up.sql'
if (Test-Path -LiteralPath $migration0160) {
  Write-Step 'Apply Package Item Type + Station transactional save migration'
  $env:PGPASSWORD = $appPassword
  Invoke-DatabaseMigration -Arguments @('-h','127.0.0.1','-p',[string]$port,'-U',$dbUser,'-d',$dbName,'-v','ON_ERROR_STOP=1','-f',$migration0160) -FailureMessage 'Package item settings migration 0160 failed.'
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
} else {
  throw 'Package item settings migration 0160 is missing from the installer package.'
}

$migration0150 = Join-Path $appRoot 'migrations\0150_system_health_update_center.up.sql'
if (Test-Path -LiteralPath $migration0150) {
  Write-Step 'Apply System Health / Update Center migration'
  $env:PGPASSWORD = $appPassword
  Invoke-DatabaseMigration -Arguments @('-h','127.0.0.1','-p',[string]$port,'-U',$dbUser,'-d',$dbName,'-v','ON_ERROR_STOP=1','-f',$migration0150) -FailureMessage 'System Health migration 0150 failed.'
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
} else {
  throw 'System Health migration 0150 is missing from the installer package.'
}

Repair-ApplicationOwnershipAfterMigration
$migrationAdminPassword = $null

Write-Step 'Configure local network access'
try {
  $ruleName = "$displayName - LAN TCP $appPort"
  Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue | Remove-NetFirewallRule -ErrorAction SilentlyContinue
  New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Action Allow -Protocol TCP -LocalPort $appPort -Profile Private -RemoteAddress LocalSubnet | Out-Null
  Write-Host "Windows Firewall rule created for TCP $appPort on Private/LocalSubnet only." -ForegroundColor Green
} catch {
  Write-Warning "Could not create the Windows Firewall rule automatically. If LAN clients cannot connect, ask IT to allow TCP $appPort for LocalSubnet only."
}
$lanAddresses = @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
  Where-Object { $_.IPAddress -notmatch '^127\.' -and $_.IPAddress -notmatch '^169\.254\.' -and $_.PrefixOrigin -ne 'WellKnown' } |
  Select-Object -ExpandProperty IPAddress -Unique)
$serverHostName = [Environment]::MachineName
$primaryLanUrl = 'http://' + $serverHostName + ':' + $appPort
$networkInfo = @(
  'Health Check Up Smart Search - Local Server',
  '',
  ('Server URL: http://localhost:' + $appPort),
  ('Primary LAN URL (hostname): ' + $primaryLanUrl),
  '',
  'Use the Health Check Up Smart Search application login. No extra LAN username/password is required.',
  '',
  'Current IP fallback URLs:'
)
foreach ($lanAddress in $lanAddresses) { $networkInfo += ('http://' + $lanAddress + ':' + $appPort) }
$networkInfo += ''
$networkInfo += 'LAN clients must be on the same network. If hostname resolution does not work, use an IP fallback URL or ask IT to add an internal DNS entry.'
$networkInfo += "Windows Firewall is opened only for TCP $appPort on Private profile / LocalSubnet. This does not expose the application directly to the Internet."
$networkInfo | Set-Content (Join-Path $appRoot 'LOCAL-SERVER.txt') -Encoding UTF8
Write-Host ('Primary LAN URL: ' + $primaryLanUrl) -ForegroundColor Yellow

if ($isUpgrade -and $backupOutput) {
  $env:PGPASSWORD = $appPassword
  $backupAt = (Get-Date).ToUniversalTime().ToString('o')
  & $psqlPath -h 127.0.0.1 -p $port -U $dbUser -d $dbName -c "INSERT INTO system_settings(key,value,updated_at) VALUES('last_backup_at','$backupAt',NOW()) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=NOW()" | Out-Null
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
}

Write-Step 'Create Desktop shortcut'
# The installer is elevated. On some Windows configurations the per-user
# Desktop resolved here belongs to the elevation account. Use the shared
# Desktop and one stable shortcut name so a new release replaces the old one.
$desktop = [Environment]::GetFolderPath('CommonDesktopDirectory')
if ([string]::IsNullOrWhiteSpace($desktop)) {
  $desktop = Join-Path $env:PUBLIC 'Desktop'
}
$oldVersionedShortcuts = Get-ChildItem $desktop -Filter 'Health Check Smart Search v*.lnk' -ErrorAction SilentlyContinue
foreach ($oldShortcut in $oldVersionedShortcuts) {
  Remove-Item $oldShortcut.FullName -Force -ErrorAction SilentlyContinue
}
$shortcutPath = Join-Path $desktop ($displayName + '.lnk')
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = (Join-Path $env:WINDIR 'System32\wscript.exe')
$shortcut.Arguments = '"' + (Join-Path $appRoot 'tools\launch.vbs') + '"'
$shortcut.WorkingDirectory = $appRoot
$shortcut.Description = $displayName
$iconFile = 'assets\app-capybara.ico'
$iconPath = Join-Path $appRoot $iconFile
if (Test-Path $iconPath) { $shortcut.IconLocation = $iconPath + ',0' }
$shortcut.Save()

# Keep only the shared shortcut. Remove the duplicate per-user shortcut that
# earlier installers created, unless Windows resolves both paths identically.
$userDesktop = [Environment]::GetFolderPath('Desktop')
if (-not [string]::IsNullOrWhiteSpace($userDesktop)) {
  $userShortcutPath = Join-Path $userDesktop ($displayName + '.lnk')
  if ($userShortcutPath -ne $shortcutPath -and (Test-Path $userShortcutPath)) {
    Remove-Item $userShortcutPath -Force -ErrorAction SilentlyContinue
  }
}

if ($env:HEALTH_CHECK_PERMANENT_BOOTSTRAP -eq '1') {
  Write-Host "`nCore installation completed. Permanent bootstrap will start and verify the server..." -ForegroundColor Green
} else {
  Write-Host "`nInstallation completed successfully." -ForegroundColor Green
  Write-Host "The Health Check Smart Search Desktop shortcut is ready."
  Write-Host 'Starting the application...'
  Start-Process -FilePath (Join-Path $env:WINDIR 'System32\wscript.exe') `
    -ArgumentList ('"' + (Join-Path $appRoot 'tools\launch.vbs') + '"') `
    -WorkingDirectory $appRoot
}
