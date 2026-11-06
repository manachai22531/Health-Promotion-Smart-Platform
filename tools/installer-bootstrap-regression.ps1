param([Parameter(Mandatory=$true)][string]$Repository)
$ErrorActionPreference='Stop'
. (Join-Path $Repository 'tools/start-production-installer.ps1')
$temp=Join-Path ([IO.Path]::GetTempPath()) ('hc-launch-test-'+[guid]::NewGuid().ToString('N'))
try {
 $source=Join-Path $temp "Downloads with spaces & test's folder"
 $windows=Join-Path $temp 'Windows'
 New-Item -ItemType Directory -Force -Path (Join-Path $source 'tools'),(Join-Path $windows 'System32/WindowsPowerShell/v1.0'),(Join-Path $windows 'Temp')|Out-Null
 [IO.File]::WriteAllText((Join-Path $source 'tools/production-installer-gui.ps1'),'# fixture')
 [IO.File]::WriteAllText((Join-Path $source 'repair-update-center.ps1'),'# repair fixture')
 [IO.File]::WriteAllText((Join-Path $windows 'System32/WindowsPowerShell/v1.0/powershell.exe'),'fixture')
 $plan=Get-InstallerLaunchPlan -SourceRoot $source -WindowsRoot $windows
 if($plan.WorkingDirectory -ne (Join-Path $windows 'Temp')){throw 'Unsafe inherited working directory'}
 if(-not $plan.Arguments.EndsWith('-File "'+$plan.Target+'"')){throw 'Script path quoting is incorrect'}
 if($plan.Arguments -match 'EncodedCommand|WindowStyle|wscript|cscript'){throw 'Unexpected wrapper arguments'}
 $repair=Get-InstallerLaunchPlan -SourceRoot $source -WindowsRoot $windows -RepairUpdateCenter
 if($repair.Target -ne (Join-Path $source 'repair-update-center.ps1')){throw 'Wrong repair entry'}
 Remove-Item (Join-Path $windows 'Temp') -Force
 $fallback=Get-InstallerLaunchPlan -SourceRoot $source -WindowsRoot $windows
 if($fallback.WorkingDirectory -ne $windows){throw 'Working directory fallback failed'}
 Remove-Item (Join-Path $source 'tools/production-installer-gui.ps1') -Force
 $failed=$false
 try {Get-InstallerLaunchPlan -SourceRoot $source -WindowsRoot $windows|Out-Null}catch{$failed=$true}
 if(-not $failed){throw 'Incomplete package was accepted'}
 'PASS: transparent PowerShell launch plan, path quoting, repair entry, safe working directory and missing-file rejection'
} finally {Remove-Item -LiteralPath $temp -Recurse -Force -ErrorAction SilentlyContinue}
