# Stop before stopping services or changing the installed application.
function Assert-NoApplicationDowngrade {
  param([Parameter(Mandatory=$true)][string]$SourceRoot,[Parameter(Mandatory=$true)][string]$TargetRoot)
  $incoming=Get-Content -LiteralPath (Join-Path $SourceRoot 'package.json') -Raw | ConvertFrom-Json
  $incomingVersion=[version](([string]$incoming.version).TrimStart('v'))
  $observed=@()
  $targetPackage=Join-Path $TargetRoot 'package.json'
  if(Test-Path -LiteralPath $targetPackage){
    $installed=Get-Content -LiteralPath $targetPackage -Raw | ConvertFrom-Json
    if(-not $installed.version){throw 'Cannot determine installed version; installation stopped.'}
    $observed+=[version](([string]$installed.version).TrimStart('v'))
  }
  $live=$null
  try{$live=Invoke-RestMethod -Uri 'http://127.0.0.1:3000/api/version' -TimeoutSec 2 -ErrorAction Stop}catch{}
  if($live -and [string]$live.environment -eq 'production'){
    if(-not $live.version){throw 'Cannot determine running version; installation stopped.'}
    $observed+=[version](([string]$live.version).TrimStart('v'))
  }
  foreach($existingVersion in $observed){
    if($existingVersion -gt $incomingVersion){throw "Downgrade blocked: installed v$existingVersion is newer than package v$incomingVersion. Obtain the matching newer source before installing these changes."}
  }
}
