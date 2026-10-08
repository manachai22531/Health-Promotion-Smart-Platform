$ErrorActionPreference = 'Stop'
$sourceRoot = Split-Path -Parent $PSScriptRoot
$guiPath = Join-Path $PSScriptRoot 'production-installer-gui.ps1'
$packageRoot = if ((Split-Path -Leaf $sourceRoot) -eq 'payload') {
    Split-Path -Parent $sourceRoot
} else {
    $sourceRoot
}
$launchLog = Join-Path $packageRoot 'installer-launcher.log'

function Write-LaunchLog([string]$Message) {
    try { Add-Content -LiteralPath $launchLog -Value ("[{0}] {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message) -Encoding UTF8 } catch {}
}

function Show-LaunchError([string]$Message) {
    try {
        Add-Type -AssemblyName PresentationFramework -ErrorAction Stop
        [System.Windows.MessageBox]::Show($Message,'Health Check Up Smart Search - Production Installer','OK','Error') | Out-Null
    } catch {
        Write-Host $Message -ForegroundColor Red
    }
}

function Test-IsAdministrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

try {
    Write-LaunchLog 'bootstrap started.'
    if (-not (Test-Path -LiteralPath $guiPath)) {
        throw "Missing installer GUI: $guiPath"
    }

    if (-not (Test-IsAdministrator)) {
        Write-LaunchLog 'Requesting Administrator permission.'
        $powershellExe = Join-Path $PSHOME 'powershell.exe'
        $argList = @(
            '-NoLogo',
            '-NoProfile',
            '-ExecutionPolicy', 'Bypass',
            '-STA',
            '-File', ('"{0}"' -f $PSCommandPath)
        ) -join ' '
        $p = Start-Process -FilePath $powershellExe -ArgumentList $argList -WorkingDirectory $sourceRoot -Verb RunAs -Wait -PassThru
        Write-LaunchLog ("Elevated bootstrap exited with code {0}." -f $p.ExitCode)
        exit $p.ExitCode
    }

    Write-LaunchLog 'Administrator permission confirmed. Starting GUI.'
    & $guiPath
    Write-LaunchLog 'GUI closed normally.'
    exit 0
}
catch {
    $detail = $_ | Out-String
    Write-LaunchLog ("ERROR: {0}" -f $detail.Trim())
    Show-LaunchError ("Installer could not start.`n`n{0}`n`nLog:`n{1}" -f $_.Exception.Message, $launchLog)
    exit 1
}
