param([Parameter(Mandatory=$true)][string]$Repository)
$ErrorActionPreference='Stop'
. (Join-Path $Repository 'tools/invoke-installer-launcher.ps1')
$dir=Join-Path ([IO.Path]::GetTempPath()) ('hc-launcher-test-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory $dir|Out-Null
$exe=(Get-Process -Id $PID).Path
try {
  $fixture=Join-Path $dir 'fixture.ps1'
  $pidFile=Join-Path $dir 'descendant.pid'
  # This child inherits stdout/stderr, reproducing a pipe that remains open
  # after the launcher exits. The helper must finish while the child is alive.
  @'
$p=New-Object Diagnostics.ProcessStartInfo
$p.FileName='/bin/sleep';$p.Arguments='20';$p.UseShellExecute=$false
$c=[Diagnostics.Process]::Start($p)
[IO.File]::WriteAllText((Join-Path $PSScriptRoot 'descendant.pid'),[string]$c.Id)
exit 0
'@ | Set-Content $fixture
  $watch=[Diagnostics.Stopwatch]::StartNew()
  Invoke-InstallerLauncher -Executable $exe -ScriptPath $fixture -WorkingDirectory $dir -TimeoutSeconds 5 -Log {param($m)}
  if($watch.Elapsed.TotalSeconds -ge 4){throw 'Launcher waited for descendant output closure'}
  $childId=[int](Get-Content $pidFile)
  if(-not(Get-Process -Id $childId -ErrorAction SilentlyContinue)){throw 'Descendant must remain running'}
  Stop-Process -Id $childId -Force
  'exit 7'|Set-Content $fixture
  $failed=$false
  try {Invoke-InstallerLauncher -Executable $exe -ScriptPath $fixture -WorkingDirectory $dir -Log {param($m)}}catch{if($_ -notmatch 'exit code 7'){throw};$failed=$true}
  if(-not $failed){throw 'Nonzero launcher was accepted'}
  'Start-Sleep -Seconds 20'|Set-Content $fixture
  $failed=$false;$watch.Restart()
  try {Invoke-InstallerLauncher -Executable $exe -ScriptPath $fixture -WorkingDirectory $dir -TimeoutSeconds 1 -Log {param($m)}}catch{if($_ -notmatch 'exceeded 1s'){throw};$failed=$true}
  if(-not $failed -or $watch.Elapsed.TotalSeconds -gt 5){throw 'Timeout was not bounded'}
  'PASS: inherited descendant handles, nonzero exit and bounded timeout'
} finally {
  if(Test-Path (Join-Path $dir 'descendant.pid')){Stop-Process -Id ([int](Get-Content (Join-Path $dir 'descendant.pid'))) -Force -ErrorAction SilentlyContinue}
  Remove-Item $dir -Recurse -Force
}
