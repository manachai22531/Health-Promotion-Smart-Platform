$ErrorActionPreference = 'Stop'
$version = 'v7.65.26'
$expectedSha = 'e1f456a7414c9b380601b5434764598c3670da7b244775d558ff5011ad8bb6a6'
$zipName = "HealthCheck-$version-PRODUCTION-WINDOWS-INSTALLER.zip"
$repository = 'https://websales.pruksa.com//GitServer/Git.vimut.HealthCheckupSmartSearch.git'
$branch = "installers/$version"
function Invoke-Git {
  & git @args
  if ($LASTEXITCODE -ne 0) { throw "Git failed (exit $LASTEXITCODE). Upload not verified." }
}
try {
  $zipPath = Join-Path $PSScriptRoot $zipName
  $checksumPath = "$zipPath.sha256"
  if (-not (Test-Path -LiteralPath $zipPath)) { throw "Place $zipName beside this script." }
  if (-not (Test-Path -LiteralPath $checksumPath)) { throw 'Place the .sha256 file beside this script.' }
  if ((Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expectedSha) { throw 'Installer SHA-256 mismatch.' }
  $checksumText = (Get-Content -LiteralPath $checksumPath -Raw).Trim()
  if ($checksumText -ne "$expectedSha  $zipName") { throw 'Checksum file mismatch.' }
  $work = Join-Path $env:TEMP ("HealthCheck-push-" + [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $work | Out-Null
  Push-Location $work
  try {
    Invoke-Git init
    Invoke-Git remote add origin $repository
    $remote = & git ls-remote --heads origin "refs/heads/$branch"
    if ($LASTEXITCODE -ne 0) { throw 'Cannot read Git server. Check connection and credentials.' }
    if ($remote) {
      Invoke-Git fetch origin $branch
      Invoke-Git switch -c $branch FETCH_HEAD
      if (Test-Path -LiteralPath $zipName) {
        if ((Get-FileHash -LiteralPath $zipName -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expectedSha) { throw 'Remote branch already contains a different installer. Nothing overwritten.' }
      }
    } else { Invoke-Git switch -c $branch }
    Copy-Item -LiteralPath $zipPath -Destination $zipName
    Copy-Item -LiteralPath $checksumPath -Destination "$zipName.sha256"
    Invoke-Git add -- $zipName "$zipName.sha256"
    & git diff --cached --quiet
    $diffExit = $LASTEXITCODE
    if ($diffExit -eq 1) {
      $author = & git config user.name
      if (-not $author) { Invoke-Git config user.name (Read-Host 'Git author name') }
      $email = & git config user.email
      if (-not $email) { Invoke-Git config user.email (Read-Host 'Git author email') }
      Invoke-Git commit -m "Add installer $version"
    } elseif ($diffExit -ne 0) { throw 'Cannot check staged files.' }
    Invoke-Git push -u origin $branch
    $commit = & git rev-parse HEAD
    if ($LASTEXITCODE -ne 0) { throw 'Cannot determine commit.' }
    $verify = Join-Path $work 'verified-download'
    Invoke-Git clone --single-branch --branch $branch $repository $verify
    $downloaded = Join-Path $verify $zipName
    if ((Get-FileHash -LiteralPath $downloaded -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expectedSha) { throw 'Downloaded installer checksum mismatch.' }
    if ((Get-Content -LiteralPath (Join-Path $verify "$zipName.sha256") -Raw).Trim() -ne $checksumText) { throw 'Downloaded checksum file mismatch.' }
    Write-Host "VERIFIED: $branch | Commit: $commit" -ForegroundColor Green
    Write-Host "SHA-256: $expectedSha"
    Write-Host "Downloaded files: $verify"
  } finally { Pop-Location }
} catch { Write-Error $_; exit 1 }
