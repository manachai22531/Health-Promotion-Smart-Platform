param([string]$ReleaseRoot=$PSScriptRoot)
$ErrorActionPreference='Stop'
. (Join-Path (Join-Path $ReleaseRoot 'tools') 'source-backup.ps1')
$fixture=Join-Path ([IO.Path]::GetTempPath()) ('source-backup-test-'+[Guid]::NewGuid().ToString('N'))
$root=Join-Path $fixture "Production with spaces'quote"
New-Item -ItemType Directory -Path $root -Force|Out-Null
try {
 foreach($dir in @('data/uploads','assets','node_modules','logs','backups','tmp','updates','.git','data/logs')){New-Item -ItemType Directory -Force -Path (Join-Path $root $dir)|Out-Null}
 [IO.File]::WriteAllText((Join-Path $root '.env'),'SECRET_FIXTURE=preserved')
 [IO.File]::WriteAllText((Join-Path $root 'data/uploads/รายชื่อ.txt'),'ทดสอบ Backup UTF8')
 [IO.File]::WriteAllText((Join-Path $root 'assets/app.js'),'application source')
 [IO.File]::WriteAllText((Join-Path $root 'data/logs/customer.txt'),'keep nested user folder')
 $random=New-Object byte[] (3MB);[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($random)
 [IO.File]::WriteAllBytes((Join-Path $root 'data/uploads/binary.dat'),$random)
 foreach($dir in @('node_modules','logs','backups','tmp','updates','.git')){[IO.File]::WriteAllText((Join-Path $root "$dir/excluded.txt"),'cache')}
 $plan=Get-SourceBackupPlan -Root $root
 if($plan.Files.Count -ne 5){throw "Wrong backup file count $($plan.Files.Count)"}
 if($plan.Bytes -lt 3MB){throw 'Missing user data bytes'}
 $zip=Join-Path $fixture 'source.zip'
 Assert-SourceBackupSpace -Plan $plan -Destination $zip
 Write-SourceBackupZip -Plan $plan -Destination $zip
 $stream=[IO.File]::OpenRead($zip);$archive=[IO.Compression.ZipArchive]::new($stream,[IO.Compression.ZipArchiveMode]::Read)
 try {
  if($archive.Entries.Count -ne 5){throw 'Wrong ZIP count'}
  foreach($file in $plan.Files){$entry=$archive.GetEntry($file.Name);$read=$entry.Open();$memory=New-Object IO.MemoryStream;try{$read.CopyTo($memory);$actual=[Convert]::ToBase64String($memory.ToArray());$expected=[Convert]::ToBase64String([IO.File]::ReadAllBytes($file.Path));if($actual -ne $expected){throw "Bytes mismatch $($file.Name)"}}finally{$read.Dispose();$memory.Dispose()}}
 }finally{$archive.Dispose();$stream.Dispose()}
 Write-Output 'PASS streaming ZIP round-trip: binary/Thai/hidden .env/user uploads/nested user folder preserved; generated caches excluded'
 $before=(Get-FileHash $zip).Hash;$rejected=$false
 try{Write-SourceBackupZip -Plan $plan -Destination $zip}catch{$rejected=$true}
 if(-not $rejected -or (Get-FileHash $zip).Hash -ne $before){throw 'Existing backup overwritten'}
 $missing=$plan.Files[0].Path;Move-Item -LiteralPath $missing -Destination ($missing+'.hold')
 $failed=Join-Path $fixture 'failed.zip';$rejected=$false
 try{Write-SourceBackupZip -Plan $plan -Destination $failed}catch{$rejected=$true}
 Move-Item -LiteralPath ($missing+'.hold') -Destination $missing
 if(-not $rejected -or (Test-Path $failed) -or (Get-ChildItem $fixture -Filter '*.partial-*')){throw 'Failed backup was published or partial not cleaned'}
 Write-Output 'PASS backup failure cleanup and no-overwrite guard; old backup remains intact'
 function Get-BackupAvailableBytes {param([string]$Destination) return 10}
 $rejected=$false
 try{Assert-SourceBackupSpace -Plan $plan -Destination $zip}catch{if($_.Exception.Message -notmatch 'BEFORE stopping Production'){throw};$rejected=$true}
 if(-not $rejected){throw 'Low space accepted'}
 # Exercise the actual deployment preflight block with a stop spy. It must throw
 # before invoking any Stop function or changing target application files.
 $deploy=[IO.File]::ReadAllText((Join-Path (Join-Path $ReleaseRoot 'tools') 'deploy-environment.ps1'))
 $begin=$deploy.IndexOf('# Scan only backup content');$end=$deploy.IndexOf('if($hasExisting){', $deploy.IndexOf('Stop-TargetServer -Root $targetRoot',$begin))
 $preflight=$deploy.Substring($begin,$end-$begin)
 $targetRoot=$root;$sourceRoot=$root;$script:stopCalled=$false
 function Stop-TargetServer {param($Root) $script:stopCalled=$true}
 $rejected=$false
 try{Invoke-Expression $preflight}catch{$rejected=$true}
 if(-not $rejected -or $script:stopCalled){throw 'Low disk preflight stopped Production'}
 Write-Output 'PASS actual deploy preflight refuses low space before stopping Production'
 # Linked user paths must fail explicitly rather than silently omit user files.
 $link=Join-Path $root 'data/link';New-Item -ItemType SymbolicLink -Path $link -Target (Join-Path $root 'assets')|Out-Null
 $rejected=$false;try{Get-SourceBackupPlan -Root $root|Out-Null}catch{$rejected=$true}
 Remove-Item -LiteralPath $link
 if(-not $rejected){throw 'Linked data silently omitted'}
 Write-Output 'PASS linked user content rejected explicitly'
} finally {Remove-Item -LiteralPath $fixture -Recurse -Force -ErrorAction SilentlyContinue}
