$ErrorActionPreference = 'Stop'
$appRoot = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $appRoot '.env'
$serverPath = Join-Path $appRoot 'server.js'
$logDir = Join-Path $appRoot 'logs'
$launcherLog = Join-Path $logDir 'launcher.log'
$packageJsonPath = Join-Path $appRoot 'package.json'
$expectedVersion = 'v7.63.02'
try {
  if (Test-Path -LiteralPath $packageJsonPath) {
    $pkg = Get-Content -LiteralPath $packageJsonPath -Raw | ConvertFrom-Json
    if ($pkg.version) { $expectedVersion = 'v' + ([string]$pkg.version).TrimStart('v') }
  }
} catch { Write-LauncherLog "WARN: could not read package.json version; using $expectedVersion" }

function Write-LauncherLog([string]$message) {
  try {
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
    "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $message" | Add-Content -LiteralPath $launcherLog -Encoding UTF8
  } catch {}
}

function Read-EnvMap([string]$path) {
  $map = @{}
  if (-not (Test-Path -LiteralPath $path)) { return $map }
  Get-Content -LiteralPath $path | ForEach-Object {
    $line = [string]$_
    if ($line.Length -gt 0) { $line = $line.TrimStart([char]0xFEFF) }
    if ([string]::IsNullOrWhiteSpace($line) -or $line -match '^\s*#') { return }
    if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') {
      $key = $matches[1]
      $value = $matches[2].Trim()
      if ($value -notmatch '^["'']') { $value = ($value -replace '\s+#.*$','').Trim() }
      $map[$key] = $value.Trim().Trim('"').Trim("'")
    }
  }
  return $map
}

function Get-AppVersion([int]$port) {
  try { return Invoke-RestMethod -Uri "http://127.0.0.1:$port/api/version" -TimeoutSec 2 }
  catch { return $null }
}

try {
  Write-LauncherLog "launcher start root=$appRoot"
  if (-not (Test-Path -LiteralPath $envPath)) { throw "ไม่พบ $envPath" }
  if (-not (Test-Path -LiteralPath $serverPath)) { throw "ไม่พบ $serverPath" }
  $cfg = Read-EnvMap $envPath
  $envName = if ($cfg.ContainsKey('APP_ENV')) { ([string]$cfg.APP_ENV).Trim().ToLowerInvariant() } else { 'production' }
  if ($envName -ne 'production') { throw "Production-only launcher: APP_ENV ต้องเป็น production" }
  if ($cfg.ContainsKey('PGDATABASE') -and ([string]$cfg.PGDATABASE).Trim() -ne 'health_check_smart_search') { throw 'Production-only launcher: PGDATABASE ต้องเป็น health_check_smart_search' }
  $expectedPort = 3000
  $appPort = $expectedPort
  if ($cfg.ContainsKey('PORT') -and -not [string]::IsNullOrWhiteSpace([string]$cfg.PORT)) {
    try { $appPort = [int]([string]$cfg.PORT).Trim() } catch { throw "PORT ใน .env ไม่ใช่ตัวเลข: $($cfg.PORT)" }
  }
  if ($appPort -ne $expectedPort) { throw "$envName ต้องใช้ PORT=$expectedPort แต่พบ PORT=$appPort" }

  function Test-Healthy {
    $v = Get-AppVersion $appPort
    return ($v -and [string]$v.version -eq $expectedVersion -and [string]$v.environment -eq 'production')
  }

  if (-not (Test-Healthy)) {
    $listener = Get-NetTCPConnection -State Listen -LocalPort $appPort -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($listener) {
      $owner = Get-CimInstance Win32_Process -Filter "ProcessId = $($listener.OwningProcess)" -ErrorAction SilentlyContinue
      $cmd = [string]$owner.CommandLine
      $belongsHere = $owner -and $owner.Name -ieq 'node.exe' -and $cmd.IndexOf($appRoot,[StringComparison]::OrdinalIgnoreCase) -ge 0
      if ($belongsHere) {
        Write-LauncherLog "stop stale $envName node pid=$($owner.ProcessId)"
        Stop-Process -Id $owner.ProcessId -Force -ErrorAction SilentlyContinue
        Start-Sleep -Milliseconds 700
      } else {
        throw "Port $appPort ถูกใช้งานโดยโปรแกรมอื่น PID $($listener.OwningProcess)"
      }
    }

    $node = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
    if (-not $node -and (Test-Path 'C:\Program Files\nodejs\node.exe')) { $node = 'C:\Program Files\nodejs\node.exe' }
    if (-not $node) { throw 'ไม่พบ Node.js' }

    Write-LauncherLog "start env=$envName node=$node server=$serverPath cwd=$appRoot port=$appPort"
    Start-Process -FilePath $node -ArgumentList @("`"$serverPath`"") -WorkingDirectory $appRoot -WindowStyle Hidden | Out-Null
    $healthy = $false
    for ($i=0; $i -lt 50; $i++) {
      Start-Sleep -Milliseconds 500
      if (Test-Healthy) { $healthy = $true; break }
    }
    if (-not $healthy) { throw "Start server แล้ว แต่ /api/version ยังไม่ตอบ $expectedVersion $envName ที่ port $appPort" }
  }

  Write-LauncherLog "health ok env=$envName port=$appPort; opening browser"
  Start-Process "http://127.0.0.1:$appPort/?release=$expectedVersion"
  exit 0
} catch {
  Write-LauncherLog "ERROR: $($_.Exception.Message)"
  try {
    Add-Type -AssemblyName PresentationFramework
    [System.Windows.MessageBox]::Show(
      "Health Check Smart Search เปิดไม่สำเร็จ`n`n$($_.Exception.Message)`n`nดู Log: $launcherLog",
      'Health Check Smart Search','OK','Error') | Out-Null
  } catch {}
  exit 1
}
