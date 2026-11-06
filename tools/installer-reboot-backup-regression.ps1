param([Parameter(Mandatory=$true)][string]$Repository)
$ErrorActionPreference='Stop'
. (Join-Path $Repository 'tools/installer-completion.ps1')
. (Join-Path $Repository 'tools/source-backup.ps1')
$events=@([pscustomobject]@{stage='Health Check';state='SUCCESS'},[pscustomobject]@{stage='Complete';state='SUCCESS'})
if(-not(Test-InstallerCompleted -ExitCode 0 -Events $events)){throw 'Valid completion was rejected'}
if(Test-InstallerCompleted -ExitCode 1 -Events $events){throw 'Failed process was accepted'}
if(Test-InstallerCompleted -ExitCode 0 -Events @()){throw 'Missing readiness was accepted'}
if(Test-InstallerCompleted -ExitCode 0 -Events @($events+[pscustomobject]@{stage='Deploy';state='FAILED'})){throw 'Failed stage was accepted'}
$temp=Join-Path ([IO.Path]::GetTempPath()) ('hc-reboot-test-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path (Join-Path $temp 'System32') -Force|Out-Null
[IO.File]::WriteAllText((Join-Path $temp 'System32/shutdown.exe'),'inert fixture, never executed')
$script:requests=New-Object 'System.Collections.Generic.List[object]'
$mock={param($exe,$arguments) $script:requests.Add([pscustomobject]@{File=$exe;Arguments=$arguments})}
try {
 foreach($flags in @(@($false,$false,$true),@($true,$true,$true),@($true,$false,$false))){
  if(Invoke-ConfirmedInstallerReboot -InstallSucceeded $flags[0] -WorkerRunning $flags[1] -Confirmed $flags[2] -WindowsRoot $temp -Launch $mock){throw 'Unauthorized reboot request'}
 }
 if($script:requests.Count -ne 0){throw 'A denied reboot invoked a process'}
 if(-not(Invoke-ConfirmedInstallerReboot -InstallSucceeded $true -WorkerRunning $false -Confirmed $true -WindowsRoot $temp -Launch $mock)){throw 'Confirmed reboot was not requested'}
 if($script:requests.Count -ne 1 -or ($script:requests[0].Arguments -join ' ') -ne '/r /t 0'){throw 'Wrong restart arguments; never force-close apps'}
 $root=Join-Path $temp 'source';New-Item -ItemType Directory -Path $root|Out-Null
 [IO.File]::WriteAllText((Join-Path $root 'app.js'),'source fixture')
 [IO.File]::WriteAllText((Join-Path $root '.env'),'retained configuration')
 $plan=Get-SourceBackupPlan -Root $root
 Assert-SourceBackupReadable -Plan $plan
 $failed=$false
 try {Assert-SourceBackupReadable -Plan $plan -OpenRead {param($file) throw 'Simulated endpoint-protection read denial'}}catch{if($_.Exception.Message -notmatch "preflight cannot read '.*'.*Production has not been stopped.*No files were skipped"){throw};$failed=$true}
 if(-not $failed){throw 'Blocked source file was ignored'}
 $zip=Join-Path $temp 'backup.zip';Write-SourceBackupZip -Plan $plan -Destination $zip
 if(-not(Test-Path $zip)){throw 'Valid complete backup was not created'}
 'PASS: explicit consent/readiness/no-running-worker reboot gates; no forced app closure; readable backup and blocked-file rejection. No actual shutdown was executed.'
} finally {Remove-Item -LiteralPath $temp -Recurse -Force -ErrorAction SilentlyContinue}
