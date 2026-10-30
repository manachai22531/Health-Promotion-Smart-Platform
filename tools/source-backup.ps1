# Windows PowerShell 5.1 compatible. Keep user data and hidden configuration.
function Get-SourceBackupPlan {
  param([string]$Root)
  $base=[IO.Path]::GetFullPath($Root).TrimEnd([IO.Path]::DirectorySeparatorChar)
  $excluded=@('node_modules','logs','backups','tmp','updates','.git')
  $files=New-Object 'System.Collections.Generic.List[object]'
  $pending=New-Object 'System.Collections.Generic.Stack[string]'
  $pending.Push($base)
  [long]$bytes=0
  while($pending.Count){
    $dir=$pending.Pop()
    foreach($item in (Get-ChildItem -LiteralPath $dir -Force -ErrorAction Stop)){
      if($item.PSIsContainer -and $dir -eq $base -and $excluded -contains $item.Name){continue}
      if($item.Attributes -band [IO.FileAttributes]::ReparsePoint){throw "Source backup cannot safely include a linked path: $($item.FullName)"}
      if($item.PSIsContainer){$pending.Push($item.FullName);continue}
      $relative=$item.FullName.Substring($base.Length+1).Replace('\','/')
      $files.Add([pscustomobject]@{Path=$item.FullName;Name=$relative;Length=[long]$item.Length;Modified=$item.LastWriteTimeUtc})
      $bytes+=$item.Length
    }
  }
  return [pscustomobject]@{Files=$files;Bytes=$bytes;Root=$base}
}

function Get-BackupAvailableBytes {
  param([string]$Destination)
  $root=[IO.Path]::GetPathRoot([IO.Path]::GetFullPath($Destination))
  return [long]([IO.DriveInfo]::new($root).AvailableFreeSpace)
}

function Assert-SourceBackupSpace {
  param([object]$Plan,[string]$Destination,[long]$PayloadBytes=0)
  # Worst-case ZIP expansion/headers plus room for deployment and dependencies.
  # The DB dump is still mandatory and may require further space for large DBs.
  [long]$required=[math]::Ceiling($Plan.Bytes*1.02)+($Plan.Files.Count*1024)+$PayloadBytes+1GB
  [long]$available=Get-BackupAvailableBytes -Destination $Destination
  Write-Host ("Source backup disk check: {0} files, source {1:N2} GiB; available {2:N2} GiB; required at least {3:N2} GiB on {4}" -f $Plan.Files.Count,($Plan.Bytes/1GB),($available/1GB),($required/1GB),$Destination)
  if($available -lt $required){throw ("Not enough free disk space BEFORE stopping Production. Available {0:N2} GiB; need at least {1:N2} GiB on {2}. Free disk space or move old backup ZIPs to another drive, then retry. Do not delete Production data or .env." -f ($available/1GB),($required/1GB),$Destination)}
}

function Write-SourceBackupZip {
  param([object]$Plan,[string]$Destination)
  Add-Type -AssemblyName System.IO.Compression
  $partial=$Destination+'.partial-'+[Guid]::NewGuid().ToString('N')
  $output=$null;$archive=$null
  [long]$copied=0;$count=0;$timer=[Diagnostics.Stopwatch]::StartNew();$lastReport=0
  $buffer=New-Object byte[] (128KB)
  try {
    $output=[IO.File]::Open($partial,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
    $archive=[IO.Compression.ZipArchive]::new($output,[IO.Compression.ZipArchiveMode]::Create,$true)
    foreach($file in $Plan.Files){
      $input=$null;$entryStream=$null
      try {
        $input=[IO.File]::Open($file.Path,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)
        if($input.Length -ne $file.Length){throw "Source changed after disk preflight: $($file.Name). Retry the installer."}
        $entry=$archive.CreateEntry($file.Name,[IO.Compression.CompressionLevel]::Fastest)
        $entryStream=$entry.Open()
        while(($read=$input.Read($buffer,0,$buffer.Length)) -gt 0){
          $entryStream.Write($buffer,0,$read);$copied+=$read
          if($timer.Elapsed.TotalSeconds-$lastReport -ge 10){
            $lastReport=$timer.Elapsed.TotalSeconds
            Write-Host ("Source backup progress: {0}/{1} files, {2:N1}/{3:N1} MiB; {4}s elapsed" -f $count,$Plan.Files.Count,($copied/1MB),($Plan.Bytes/1MB),[int]$lastReport)
          }
        }
        $count++
      } finally {if($entryStream){$entryStream.Dispose()};if($input){$input.Dispose()}}
    }
    $archive.Dispose();$archive=$null;$output.Dispose();$output=$null
    # Read the central directory and compare every entry to the source plan.
    $verifyInput=[IO.File]::OpenRead($partial);$verify=$null
    try {
      $verify=[IO.Compression.ZipArchive]::new($verifyInput,[IO.Compression.ZipArchiveMode]::Read,$true)
      if($verify.Entries.Count -ne $Plan.Files.Count){throw 'Source backup entry count mismatch.'}
      foreach($file in $Plan.Files){$entry=$verify.GetEntry($file.Name);if(-not $entry -or $entry.Length -ne $file.Length){throw "Source backup verification failed: $($file.Name)"}}
    } finally {if($verify){$verify.Dispose()};$verifyInput.Dispose()}
    # No overwrite: keep existing backups intact, publish only a completed ZIP.
    [IO.File]::Move($partial,$Destination)
    Write-Host ("Source backup verified: {0} files, {1:N1} MiB -> {2}" -f $count,($copied/1MB),$Destination)
  } finally {
    if($archive){try{$archive.Dispose()}catch{}}
    if($output){try{$output.Dispose()}catch{}}
    if(Test-Path -LiteralPath $partial){Remove-Item -LiteralPath $partial -Force -ErrorAction SilentlyContinue}
  }
}
