function Test-InstallerCompleted {
 param([int]$ExitCode,[object[]]$Events)
 return ($ExitCode -eq 0 -and @($Events|Where-Object{$_.stage -eq 'Complete' -and $_.state -eq 'SUCCESS'}).Count -gt 0 -and @($Events|Where-Object{$_.stage -eq 'Health Check' -and $_.state -eq 'SUCCESS'}).Count -gt 0 -and @($Events|Where-Object{$_.state -eq 'FAILED'}).Count -eq 0)
}
function Invoke-ConfirmedInstallerReboot {
 param([bool]$InstallSucceeded,[bool]$WorkerRunning,[bool]$Confirmed,[string]$WindowsRoot=$env:WINDIR,[scriptblock]$Launch={param($file,$arguments) $p=Start-Process -FilePath $file -ArgumentList $arguments -PassThru -Wait -ErrorAction Stop; if($p.ExitCode -ne 0){throw "Windows restart request failed with exit code $($p.ExitCode)"}})
 if(-not $InstallSucceeded -or $WorkerRunning -or -not $Confirmed){return $false}
 $shutdown=Join-Path $WindowsRoot 'System32\shutdown.exe'
 if(-not(Test-Path -LiteralPath $shutdown -PathType Leaf)){throw 'Windows shutdown.exe was not found.'}
 # /t 0 avoids Windows implying /f for a nonzero countdown. Never force-close apps.
 & $Launch $shutdown @('/r','/t','0')|Out-Null
 return $true
}
