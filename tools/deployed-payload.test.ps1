$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'assert-deployed-payload.ps1')
$fixture=Join-Path ([IO.Path]::GetTempPath()) ('HealthCheck-payload-test-'+[Guid]::NewGuid().ToString('N'))
$source=Join-Path $fixture 'source';$target=Join-Path $fixture 'target'
function Expect-Failure([scriptblock]$Action,[string]$Pattern){
  $caught=$false
  try{& $Action}catch{if($_.Exception.Message -notmatch $Pattern){throw};$caught=$true}
  if(-not $caught){throw "Expected failure matching $Pattern"}
}
try{
  New-Item -ItemType Directory -Force -Path $source,$target|Out-Null
  $new=Join-Path $source 'server.js';$old=Join-Path $target 'server.js'
  [IO.File]::WriteAllText($new,"const version='v7.65.20';")
  [IO.File]::WriteAllText($old,"const version='v7.65.19';")
  $stamp=[datetime]'2026-10-31T00:00:00Z';(Get-Item $new).LastWriteTimeUtc=$stamp;(Get-Item $old).LastWriteTimeUtc=$stamp
  if((Get-Item $new).Length -ne (Get-Item $old).Length){throw 'Fixture must have equal size'}
  $manifest=Join-Path $source 'SOURCE-MANIFEST-SHA256.txt'
  [IO.File]::WriteAllText($manifest,((Get-FileHash $new -Algorithm SHA256).Hash.ToLowerInvariant()+'  server.js'))
  Expect-Failure {Assert-DeployedPayload $source $target} 'checksum mismatch'
  Copy-Item -LiteralPath $new -Destination $old -Force
  [IO.File]::WriteAllText((Join-Path $target '.env'),'preserve-me')
  Assert-DeployedPayload $source $target
  if([IO.File]::ReadAllText((Join-Path $target '.env')) -ne 'preserve-me'){throw 'Runtime config changed'}
  Remove-Item -LiteralPath $old
  Expect-Failure {Assert-DeployedPayload $source $target} 'missing'
  [IO.File]::WriteAllText($manifest,('a'*64+'  ../outside.js'))
  Expect-Failure {Assert-DeployedPayload $source $target} 'escapes'
  [IO.File]::WriteAllText($manifest,'')
  Expect-Failure {Assert-DeployedPayload $source $target} 'empty'
  Write-Host 'PASS: equal-time/equal-size stale files rejected; correct copy accepted; runtime config preserved; missing/traversal/empty manifests rejected.'
}finally{Remove-Item -LiteralPath $fixture -Force -Recurse -ErrorAction SilentlyContinue}
