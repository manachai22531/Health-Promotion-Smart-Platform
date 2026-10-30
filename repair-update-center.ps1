$ErrorActionPreference='Stop'
function Install-UpdaterRepair {
 param([string]$TargetRoot,[string]$Payload,[string]$ExpectedHash,[string]$NodePath)
 $target=Join-Path (Join-Path $TargetRoot 'tools') 'app-update-helper.js'
 $packageFile=Join-Path $TargetRoot 'package.json'
 if(-not(Test-Path -LiteralPath $target -PathType Leaf)){throw 'Production updater helper was not found.'}
 if(-not(Test-Path -LiteralPath (Join-Path $TargetRoot '.env'))){throw 'Production .env was not found.'}
 $package=Get-Content -LiteralPath $packageFile -Raw|ConvertFrom-Json
 if($package.name -ne 'health-check-smart-search-postgresql'){throw 'Target is not a HealthCheck application.'}
 $statusPath=Join-Path (Join-Path $TargetRoot 'updates') 'update-status.json'
 if(Test-Path -LiteralPath $statusPath){
  $status=Get-Content -LiteralPath $statusPath -Raw|ConvertFrom-Json
  if([string]$status.phase -in @('QUEUED','PREFLIGHT','BACKUP','STOP','DEPLOY','MIGRATE','START','HEALTH','ROLLBACK')){throw 'An update is running. Wait until it stops before repairing.'}
 }
 if((Get-FileHash -LiteralPath $Payload -Algorithm SHA256).Hash -ine $ExpectedHash){throw 'Repair payload checksum mismatch.'}
 & $NodePath --check $Payload
 if($LASTEXITCODE -ne 0){throw 'Repair helper JavaScript syntax validation failed.'}
 $before=(Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash
 if($before -ieq $ExpectedHash){return 'Updater helper is already repaired. No changes were needed.'}
 if(-not([IO.File]::ReadAllText($target).Contains('async function preflight'))){throw 'Existing helper format is unsupported; use the full Windows installer.'}
 $backupDir=Join-Path $TargetRoot 'backups'
 New-Item -ItemType Directory -Force -Path $backupDir|Out-Null
 $suffix=(Get-Date -Format 'yyyyMMdd-HHmmss')+'-'+[Guid]::NewGuid().ToString('N').Substring(0,8)
 $backup=Join-Path $backupDir ('updater-helper-before-repair-'+$suffix+'.js')
 Copy-Item -LiteralPath $target -Destination $backup -ErrorAction Stop
 if((Get-FileHash -LiteralPath $backup -Algorithm SHA256).Hash -ine $before){throw 'Could not verify the original helper backup.'}
 $temp=Join-Path (Split-Path -Parent $target) ('.updater-repair-'+$suffix+'.tmp')
 try{
  Copy-Item -LiteralPath $Payload -Destination $temp -ErrorAction Stop
  [IO.File]::Replace($temp,$target,[System.Management.Automation.Language.NullString]::Value)
  if((Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash -ine $ExpectedHash){
   Copy-Item -LiteralPath $backup -Destination $target -Force
   throw 'Repair verification failed; original helper restored.'
  }
 }finally{Remove-Item -LiteralPath $temp -Force -ErrorAction SilentlyContinue}
 return "Updater helper repaired. Original backup: $backup"
}
try{
 Add-Type -AssemblyName PresentationFramework
 $identity=[Security.Principal.WindowsIdentity]::GetCurrent()
 $principal=New-Object Security.Principal.WindowsPrincipal($identity)
 if(-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw 'Please launch REPAIR-UPDATE-CENTER.vbs and allow Administrator access.'}
 $node=(Get-Command node.exe -ErrorAction SilentlyContinue).Source
 if(-not $node){$node=Join-Path $env:ProgramFiles 'nodejs\node.exe'}
 if(-not(Test-Path -LiteralPath $node)){throw 'Node.js was not found.'}
 $result=Install-UpdaterRepair -TargetRoot 'D:\HealthCheck\Production' -Payload (Join-Path (Join-Path $PSScriptRoot 'tools') 'app-update-helper.js') -ExpectedHash 'e360654ea44491f4a0d0641484df51bb254e8257cf240e5b86ef7e71c3429999' -NodePath $node
 [Windows.MessageBox]::Show("$result`n`nNext: upload the v7.64.87 PRODUCTION installer ZIP again in Update Center, then run the readiness check before installing. The running app was not stopped.",'HealthCheck Update Center Repair','OK','Information')|Out-Null
}catch{
 try{[Windows.MessageBox]::Show($_.Exception.Message,'HealthCheck Update Center Repair','OK','Error')|Out-Null}catch{Write-Error $_}
 exit 1
}
