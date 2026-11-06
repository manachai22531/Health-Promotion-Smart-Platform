param([switch]$RepairUpdateCenter)
$ErrorActionPreference='Stop'
function Get-InstallerLaunchPlan {
 param([Parameter(Mandatory=$true)][string]$SourceRoot,[Parameter(Mandatory=$true)][string]$WindowsRoot,[switch]$RepairUpdateCenter)
 if($SourceRoot.Contains('"') -or $WindowsRoot.Contains('"')){throw 'Installer path contains an invalid quote.'}
 $target=if($RepairUpdateCenter){Join-Path $SourceRoot 'repair-update-center.ps1'}else{Join-Path $SourceRoot 'tools\production-installer-gui.ps1'}
 if(-not(Test-Path -LiteralPath $target -PathType Leaf)){throw "Installer files are incomplete. Extract the whole ZIP. Missing: $target"}
 $power=Join-Path $WindowsRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
 if(-not(Test-Path -LiteralPath $power -PathType Leaf)){throw 'Windows PowerShell was not found.'}
 $work=Join-Path $WindowsRoot 'Temp'
 if(-not(Test-Path -LiteralPath $work -PathType Container)){$work=$WindowsRoot}
 if(-not(Test-Path -LiteralPath $work -PathType Container)){throw 'Windows working directory is unavailable.'}
 return [pscustomobject]@{Executable=$power;Arguments=('-NoLogo -NoProfile -ExecutionPolicy Bypass -STA -File "'+$target+'"');WorkingDirectory=$work;Target=$target}
}
# Dot-sourcing exposes the launch-plan validator for regression tests only.
if($MyInvocation.InvocationName -eq '.'){return}
try {
 $source=Split-Path -Parent $PSScriptRoot
 $plan=Get-InstallerLaunchPlan -SourceRoot $source -WindowsRoot $env:WINDIR -RepairUpdateCenter:$RepairUpdateCenter
 $identity=[Security.Principal.WindowsIdentity]::GetCurrent()
 $principal=New-Object Security.Principal.WindowsPrincipal($identity)
 $launch=@{FilePath=$plan.Executable;ArgumentList=$plan.Arguments;WorkingDirectory=$plan.WorkingDirectory;PassThru=$true;ErrorAction='Stop'}
 if(-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){$launch.Verb='RunAs'}
 # Normal, visible Windows process launch; no VBScript/hidden wrapper or encoded commands.
 $process=Start-Process @launch
 Write-Host "Installer started (PID $($process.Id)). Complete the visible installer window."
 exit 0
} catch {
 Write-Error -ErrorAction Continue ('Unable to launch installer: '+$_.Exception.Message)
 exit 1
}
