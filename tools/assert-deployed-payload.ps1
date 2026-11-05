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
    if($actual -ine $entry.Groups[1].Value){throw "Deployed file checksum mismatch: $relative. New release was not copied completely; installation stopped before launch."}
    $count++
  }
  if($count -eq 0){throw 'Deployment manifest is empty.'}
  Write-Host "Deployed payload SHA256 verified: $count files at $TargetRoot"
}
