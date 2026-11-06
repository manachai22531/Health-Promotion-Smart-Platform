# Poll the launcher process directly. Never pipe a native launcher into a
# PowerShell pipeline: descendants can retain a pipe handle after it exits.
function Invoke-InstallerLauncher {
  param(
    [Parameter(Mandatory=$true)][string]$Executable,
    [Parameter(Mandatory=$true)][string]$ScriptPath,
    [Parameter(Mandatory=$true)][string]$WorkingDirectory,
    [int]$TimeoutSeconds=120,
    [scriptblock]$Log={param($message) Write-Output $message}
  )
  $psi=New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName=$Executable
  $psi.Arguments='-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "'+$ScriptPath+'"'
  $psi.WorkingDirectory=$WorkingDirectory
  $psi.UseShellExecute=$false
  $psi.CreateNoWindow=$true
  # No redirected pipes to drain or wait for. run.ps1 records diagnostics in
  # Production\logs\launcher.log and server-specific stdout/stderr files.
  $process=New-Object System.Diagnostics.Process
  $process.StartInfo=$psi
  try {
    if(-not $process.Start()){throw 'Could not start the Production launcher.'}
    $timer=[Diagnostics.Stopwatch]::StartNew()
    $lastReport=-5
    while(-not $process.HasExited){
      if($timer.Elapsed.TotalSeconds -ge $TimeoutSeconds){
        # Terminate this launcher only, never the server process tree.
        try {$process.Kill()} catch {}
        throw "Production launcher exceeded ${TimeoutSeconds}s. Review Production\logs\launcher.log and server logs."
      }
      if($timer.Elapsed.TotalSeconds-$lastReport -ge 5){
        $lastReport=$timer.Elapsed.TotalSeconds
        & $Log ("Waiting for launcher PID={0}, elapsed={1}s; diagnostics: Production\logs\launcher.log" -f $process.Id,[int]$lastReport)
      }
      Start-Sleep -Milliseconds 200
    }
    $exitCode=$process.ExitCode
    & $Log "Production launcher process finished with exit code $exitCode."
    if($exitCode -ne 0){throw "Production launcher failed with exit code $exitCode. Review Production\logs\launcher.log"}
  } finally {if($process){$process.Dispose()}}
}
