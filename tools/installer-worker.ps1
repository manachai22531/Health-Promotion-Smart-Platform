    param(
      [ValidateSet('production')][string]$Mode='production',
      [Parameter(Mandatory=$true)][string]$LogFile,
      [Parameter(Mandatory=$true)][string]$StatusFile,
      [string]$PgCredentialFile=''
    )
    $ErrorActionPreference='Stop'
    $worker=Join-Path $PSScriptRoot 'production-installer-worker.ps1'
    if(-not(Test-Path -LiteralPath $worker)){throw 'Production installer worker not found'}
    $args=@('-NoProfile','-ExecutionPolicy','Bypass','-File',('"{0}"' -f $worker),'-LogFile',('"{0}"' -f $LogFile),'-StatusFile',('"{0}"' -f $StatusFile))
    if($PgCredentialFile){$args+=@('-PgCredentialFile',('"{0}"' -f $PgCredentialFile))}
    $p=Start-Process -FilePath (Join-Path $PSHOME 'powershell.exe') -ArgumentList ($args -join ' ') -WorkingDirectory $env:TEMP -Wait -PassThru
    exit $p.ExitCode
