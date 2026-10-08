$ErrorActionPreference = 'Stop'
$appRoot = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $appRoot '.env'
if (-not (Test-Path $envFile)) { throw ' ' }
Get-Content $envFile | ForEach-Object {
  if ($_ -match '^([^#=]+)=(.*)$') { [Environment]::SetEnvironmentVariable($matches[1], $matches[2], 'Process') }
}
$pgRestore = Get-ChildItem 'C:\Program Files\PostgreSQL\*\bin\pg_restore.exe' -ErrorAction SilentlyContinue | Sort-Object FullName -Descending | Select-Object -First 1
$pgDump = Get-ChildItem 'C:\Program Files\PostgreSQL\*\bin\pg_dump.exe' -ErrorAction SilentlyContinue | Sort-Object FullName -Descending | Select-Object -First 1
if (-not $pgRestore -or -not $pgDump) { throw ' Backup/Restore  PostgreSQL' }
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.OpenFileDialog
$dialog.InitialDirectory = Join-Path $appRoot 'backups'
$dialog.Filter = 'PostgreSQL backup (*.backup)|*.backup|All files (*.*)|*.*'
$dialog.Title = ' Backup  '
if ($dialog.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { Write-Host ' '; exit 0 }
$selected = $dialog.FileName
$answer = [System.Windows.Forms.MessageBox]::Show(" :`n$selected`n`n ?",' Restore','YesNo','Warning')
if ($answer -ne [System.Windows.Forms.DialogResult]::Yes) { Write-Host ' '; exit 0 }
$backupDir = Join-Path $appRoot 'backups'
New-Item -ItemType Directory -Force $backupDir | Out-Null
$safety = Join-Path $backupDir ("before-restore-" + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.backup')
& $pgDump.FullName -h $env:PGHOST -p $env:PGPORT -U $env:PGUSER -d $env:PGDATABASE -Fc -f $safety
if ($LASTEXITCODE -ne 0) { throw ' Restore  ' }
& $pgRestore.FullName -h $env:PGHOST -p $env:PGPORT -U $env:PGUSER -d $env:PGDATABASE --clean --if-exists --no-owner --no-privileges $selected
if ($LASTEXITCODE -ne 0) { throw "Restore  Restore  $safety" }
[System.Windows.Forms.MessageBox]::Show(' ','Restore  ','OK','Information') | Out-Null
