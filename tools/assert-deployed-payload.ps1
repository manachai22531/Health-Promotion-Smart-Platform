# Read-only verification: retained runtime configuration and database are untouched.
function Assert-DeployedPayload {
  param([Parameter(Mandatory=$true)][string]$SourceRoot,[Parameter(Mandatory=$true)][string]$TargetRoot)
  $manifest=Join-Path $SourceRoot 'SOURCE-MANIFEST-SHA256.txt'
  if(-not(Test-Path -LiteralPath $manifest -PathType Leaf)){throw 'Deployment manifest is missing.'}
  $prefix=[IO.Path]::GetFullPath($TargetRoot).TrimEnd([IO.Path]::DirectorySeparatorChar)+[IO.Path]::DirectorySeparatorChar
  $count=0
  foreach($line in [IO.File]::ReadAllLines($manifest,[Text.Encoding]::UTF8)){
    if([string]::IsNullOrWhiteSpace($line)){continue}
    $entry=[regex]::Match($line,'^([a-fA-F0-9]{64})  (.+)$')
    if(-not $entry.Success){throw 'Invalid deployment manifest entry.'}
    $relative=$entry.Groups[2].Value
    if([IO.Path]::IsPathRooted($relative)){throw 'Absolute deployment manifest paths are not allowed.'}
    $file=[IO.Path]::GetFullPath((Join-Path $TargetRoot $relative.Replace([char]'/',[IO.Path]::DirectorySeparatorChar)))
    if(-not $file.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase)){throw 'Deployment manifest path escapes the target folder.'}
    if(-not(Test-Path -LiteralPath $file -PathType Leaf)){throw "Deployed file is missing: $relative"}
    $actual=(Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash
    if($actual -ine $entry.Groups[1].Value){throw "Deployed file checksum mismatch: $relative; expected=$($entry.Groups[1].Value); actual=$actual. New release was not copied completely; installation stopped before launch."}
    $count++
  }
  if($count -eq 0){throw 'Deployment manifest is empty.'}
  Write-Host "Deployed payload SHA256 verified: $count files at $TargetRoot"
}

function Copy-VerifiedPayload {
  param([Parameter(Mandatory=$true)][string]$SourceRoot,[Parameter(Mandatory=$true)][string]$TargetRoot)
  # Validate all source bytes and paths before writing any application file.
  Assert-DeployedPayload -SourceRoot $SourceRoot -TargetRoot $SourceRoot
  $manifest=Join-Path $SourceRoot 'SOURCE-MANIFEST-SHA256.txt'
  $sourcePrefix=[IO.Path]::GetFullPath($SourceRoot).TrimEnd([IO.Path]::DirectorySeparatorChar)+[IO.Path]::DirectorySeparatorChar
  $targetPrefix=[IO.Path]::GetFullPath($TargetRoot).TrimEnd([IO.Path]::DirectorySeparatorChar)+[IO.Path]::DirectorySeparatorChar
  $copyEntries=@()
  foreach($line in [IO.File]::ReadAllLines($manifest,[Text.Encoding]::UTF8)){
    if([string]::IsNullOrWhiteSpace($line)){continue}
    $entry=[regex]::Match($line,'^([a-fA-F0-9]{64})  (.+)$')
    if(-not $entry.Success){throw 'Invalid deployment manifest entry.'}
    $relative=$entry.Groups[2].Value
    $parts=$relative -split '[/\\]'
    if($parts[0] -match '^(\.env.*|API-KEY\.txt|DATABASE-CONNECTION\.txt|LOCAL-SERVER\.txt|\.git|node_modules|logs|backups|tmp|updates)$'){
      throw "Runtime configuration cannot be replaced by a payload manifest: $relative"
    }
    $platformPath=$relative.Replace([char]'/',[IO.Path]::DirectorySeparatorChar)
    $from=[IO.Path]::GetFullPath((Join-Path $SourceRoot $platformPath))
    $to=[IO.Path]::GetFullPath((Join-Path $TargetRoot $platformPath))
    if(-not $from.StartsWith($sourcePrefix,[StringComparison]::OrdinalIgnoreCase) -or -not $to.StartsWith($targetPrefix,[StringComparison]::OrdinalIgnoreCase)){
      throw 'Deployment copy path escapes the payload or target folder.'
    }
    $copyEntries+=@{From=$from;To=$to;Name=$relative;Hash=$entry.Groups[1].Value}
  }
  Write-Host "Copying $($copyEntries.Count) manifest files with unconditional byte replacement..."
  foreach($entry in $copyEntries){
    [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($entry.To))|Out-Null
    [IO.File]::Copy($entry.From,$entry.To,$true)
    $actual=(Get-FileHash -LiteralPath $entry.To -Algorithm SHA256).Hash
    if($actual -ine $entry.Hash){throw "Deployment write verification failed: $($entry.Name); expected=$($entry.Hash); actual=$actual"}
  }
  # Metadata manifests are not self-hashed; copy them explicitly for repair/audit.
  foreach($name in @('SOURCE-MANIFEST-SHA256.txt','SOURCE-SHA256.txt')){
    $from=Join-Path $SourceRoot $name
    if(Test-Path -LiteralPath $from){[IO.File]::Copy($from,(Join-Path $TargetRoot $name),$true)}
  }
  Assert-DeployedPayload -SourceRoot $SourceRoot -TargetRoot $TargetRoot
}
