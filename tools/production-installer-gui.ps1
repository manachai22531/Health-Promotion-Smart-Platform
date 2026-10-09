$ErrorActionPreference='Stop'
Add-Type -AssemblyName PresentationFramework,PresentationCore,WindowsBase
$sourceRoot=Split-Path -Parent $PSScriptRoot
$version='v7.62.93 PRODUCTION'
try {
  $pkgPath=Join-Path $sourceRoot 'package.json'
  if(Test-Path -LiteralPath $pkgPath){
    $pkg=Get-Content -LiteralPath $pkgPath -Raw | ConvertFrom-Json
    if($pkg.version){$version=('v'+([string]$pkg.version).TrimStart('v')+' PRODUCTION')}
  }
} catch {}
$runtimeRoot=Join-Path $env:TEMP 'HealthCheck-Production-Installer'
New-Item -ItemType Directory -Force -Path $runtimeRoot | Out-Null
$stamp=Get-Date -Format 'yyyyMMdd-HHmmss'
$logFile=Join-Path $runtimeRoot "installer-production-$stamp.log"
$statusFile=Join-Path $runtimeRoot "installer-production-$stamp.status.jsonl"
$credentialFile=Join-Path $runtimeRoot "pgadmin-production-$stamp.sec"

[xml]$xaml=@'
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation" xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
 Title="Health Check Up Smart Search - Production Installer" Width="960" Height="720" MinWidth="780" MinHeight="620"
 WindowStartupLocation="CenterScreen" ResizeMode="CanResizeWithGrip" Background="#F4F7FA" UseLayoutRounding="True" SnapsToDevicePixels="True">
 <Window.Resources>
  <Style TargetType="TextBlock"><Setter Property="FontFamily" Value="Segoe UI"/></Style>
  <Style TargetType="Button"><Setter Property="FontFamily" Value="Segoe UI"/><Setter Property="FontSize" Value="12"/><Setter Property="MinHeight" Value="34"/><Setter Property="Padding" Value="14,6"/><Setter Property="Margin" Value="4,0,0,0"/><Setter Property="Cursor" Value="Hand"/></Style>
 </Window.Resources>
 <Grid>
  <Grid.RowDefinitions><RowDefinition Height="Auto"/><RowDefinition Height="*"/><RowDefinition Height="Auto"/></Grid.RowDefinitions>
  <Border Grid.Row="0" Background="#073B69" Padding="24,16">
   <Grid><Grid.ColumnDefinitions><ColumnDefinition Width="*"/><ColumnDefinition Width="Auto"/></Grid.ColumnDefinitions>
    <StackPanel Margin="0,0,20,0">
     <TextBlock Text="HEALTH CHECK UP - SMART SEARCH" Foreground="#8FE5DB" FontSize="11" FontWeight="Bold"/>
     <TextBlock Text="Production Installer" Foreground="White" FontSize="25" FontWeight="Bold" Margin="0,2,0,0"/>
     <TextBlock Text="Backup, deploy, database migration, start and health check" Foreground="#D8E8F3" FontSize="11" TextWrapping="Wrap" Margin="0,3,0,0"/>
    </StackPanel>
    <Border Grid.Column="1" Background="#0B8EA1" CornerRadius="15" Padding="13,7" VerticalAlignment="Center"><TextBlock x:Name="VersionText" Foreground="White" FontWeight="Bold"/></Border>
   </Grid>
  </Border>

  <Grid Grid.Row="1" Margin="20,16,20,14">
   <Grid.RowDefinitions><RowDefinition Height="Auto"/><RowDefinition Height="Auto"/><RowDefinition Height="Auto"/><RowDefinition Height="*"/></Grid.RowDefinitions>
   <Border Grid.Row="0" Background="#FFF4DF" BorderBrush="#E6B85C" BorderThickness="1" CornerRadius="9" Padding="13">
    <Grid><Grid.ColumnDefinitions><ColumnDefinition Width="*"/><ColumnDefinition Width="Auto"/></Grid.ColumnDefinitions>
     <StackPanel Margin="0,0,18,0"><TextBlock Text="PRODUCTION ONLY" Foreground="#9A4B00" FontSize="15" FontWeight="Bold"/><TextBlock Text="D:\HealthCheck\Production   |   Port 3000   |   DB health_check_smart_search" Foreground="#675744" FontSize="10" TextWrapping="Wrap" Margin="0,3,0,0"/></StackPanel>
     <TextBlock Grid.Column="1" Text="Production-only package · Port 3000 · Production DB" Foreground="#9A4B00" FontWeight="SemiBold" VerticalAlignment="Center" TextWrapping="Wrap" MaxWidth="210" TextAlignment="Right"/>
    </Grid>
   </Border>

   <Grid Grid.Row="1" Margin="0,10,0,0"><Grid.ColumnDefinitions><ColumnDefinition Width="3*"/><ColumnDefinition Width="2*"/></Grid.ColumnDefinitions>
    <Border Grid.Column="0" Background="White" BorderBrush="#D4E0E8" BorderThickness="1" CornerRadius="8" Padding="12" Margin="0,0,5,0">
     <Grid><Grid.RowDefinitions><RowDefinition Height="Auto"/><RowDefinition Height="Auto"/></Grid.RowDefinitions>
      <TextBlock Text="PostgreSQL admin password" FontWeight="SemiBold" Foreground="#173D59"/>
      <Grid Grid.Row="1" Margin="0,7,0,0"><Grid.ColumnDefinitions><ColumnDefinition Width="*"/><ColumnDefinition Width="Auto"/></Grid.ColumnDefinitions>
       <PasswordBox x:Name="PgPasswordBox" Height="32" Padding="7" VerticalContentAlignment="Center"/>
       <TextBlock Grid.Column="1" Text="Optional for upgrade" Foreground="#71828D" FontSize="10" VerticalAlignment="Center" Margin="10,0,0,0"/>
      </Grid>
     </Grid>
    </Border>
    <Border Grid.Column="1" Background="#F8FBFD" BorderBrush="#D4E0E8" BorderThickness="1" CornerRadius="8" Padding="12" Margin="5,0,0,0"><TextBlock Text="Source and database backups are created before Production changes. A failed health check stops the installation." Foreground="#5D7381" FontSize="10" TextWrapping="Wrap" VerticalAlignment="Center"/></Border>
   </Grid>

   <StackPanel Grid.Row="2" Margin="0,13,0,0">
    <TextBlock Text="Installation progress" FontSize="16" FontWeight="Bold" Foreground="#073B69" Margin="0,0,0,7"/>
    <Border Background="White" BorderBrush="#C9D9E4" BorderThickness="1" CornerRadius="9" Padding="10">
     <StackPanel>
      <UniformGrid Columns="6">
       <Border x:Name="StepPreflight" Background="#EDF2F6" CornerRadius="6" Padding="6" Margin="2"><TextBlock Text="Preflight" HorizontalAlignment="Center" FontSize="10" TextTrimming="CharacterEllipsis"/></Border>
       <Border x:Name="StepBackup" Background="#EDF2F6" CornerRadius="6" Padding="6" Margin="2"><TextBlock Text="Backup" HorizontalAlignment="Center" FontSize="10"/></Border>
       <Border x:Name="StepDeploy" Background="#EDF2F6" CornerRadius="6" Padding="6" Margin="2"><TextBlock Text="Deploy" HorizontalAlignment="Center" FontSize="10"/></Border>
       <Border x:Name="StepMigrate" Background="#EDF2F6" CornerRadius="6" Padding="6" Margin="2"><TextBlock Text="Migrate" HorizontalAlignment="Center" FontSize="10"/></Border>
       <Border x:Name="StepStart" Background="#EDF2F6" CornerRadius="6" Padding="6" Margin="2"><TextBlock Text="Start" HorizontalAlignment="Center" FontSize="10"/></Border>
       <Border x:Name="StepHealth" Background="#EDF2F6" CornerRadius="6" Padding="6" Margin="2"><TextBlock Text="Health" HorizontalAlignment="Center" FontSize="10"/></Border>
      </UniformGrid>
      <ProgressBar x:Name="Progress" Height="7" Margin="2,9,2,0" Minimum="0" Maximum="100" Value="0"/>
      <TextBlock x:Name="StatusText" Text="Ready to install Production." Foreground="#506A79" Margin="2,7,2,0" FontSize="10" TextWrapping="Wrap" MinHeight="16"/>
     </StackPanel>
    </Border>
   </StackPanel>

   <Grid Grid.Row="3" Margin="0,12,0,0"><Grid.RowDefinitions><RowDefinition Height="Auto"/><RowDefinition Height="*"/></Grid.RowDefinitions>
    <Grid Grid.Row="0" Margin="0,0,0,5"><Grid.ColumnDefinitions><ColumnDefinition Width="*"/><ColumnDefinition Width="Auto"/></Grid.ColumnDefinitions>
     <TextBlock Text="Installer log" FontSize="15" FontWeight="Bold" Foreground="#073B69" VerticalAlignment="Center"/>
     <StackPanel Grid.Column="1" Orientation="Horizontal"><Button x:Name="CopyErrorButton" Content="Copy error" IsEnabled="False"/><Button x:Name="OpenLogButton" Content="Open log"/></StackPanel>
    </Grid>
    <Border Grid.Row="1" Background="#111A22" CornerRadius="8" Padding="8" MinHeight="120">
     <TextBox x:Name="LogBox" IsReadOnly="True" AcceptsReturn="True" VerticalScrollBarVisibility="Auto" HorizontalScrollBarVisibility="Disabled" TextWrapping="Wrap" Background="#111A22" Foreground="#D6E6EE" BorderThickness="0" FontFamily="Consolas" FontSize="10"/>
    </Border>
   </Grid>
  </Grid>

  <Border Grid.Row="2" Background="White" BorderBrush="#D5E0E7" BorderThickness="0,1,0,0" Padding="18,10">
   <Grid><Grid.ColumnDefinitions><ColumnDefinition Width="*"/><ColumnDefinition Width="Auto"/></Grid.ColumnDefinitions>
    <TextBlock x:Name="FooterText" Text="Ready. This installer changes Production only." Foreground="#536D7B" VerticalAlignment="Center" TextWrapping="Wrap" Margin="0,0,15,0"/>
    <StackPanel Grid.Column="1" Orientation="Horizontal"><Button x:Name="CloseButton" Content="Close" MinWidth="82"/><Button x:Name="InstallButton" Content="Install Production" MinWidth="145" Background="#0A8FA1" Foreground="White" BorderBrush="#0A8FA1" FontWeight="Bold"/></StackPanel>
   </Grid>
  </Border>

  <Grid x:Name="ResultOverlay" Grid.RowSpan="3" Background="#99000000" Visibility="Collapsed">
   <Border Width="520" MaxWidth="620" MinWidth="420" Background="White" CornerRadius="12" Padding="24" HorizontalAlignment="Center" VerticalAlignment="Center">
    <StackPanel>
     <Border x:Name="ResultBadge" Background="#E8F5EE" CornerRadius="18" Padding="12,6" HorizontalAlignment="Left"><TextBlock x:Name="ResultKind" Text="RESULT" FontWeight="Bold" Foreground="#1C714B"/></Border>
     <TextBlock x:Name="ResultTitle" Text="Installation result" FontSize="22" FontWeight="Bold" Foreground="#173D59" Margin="0,14,0,0" TextWrapping="Wrap"/>
     <TextBlock x:Name="ResultMessage" Text="" Foreground="#526A78" Margin="0,8,0,0" TextWrapping="Wrap" MaxHeight="150"/>
     <TextBlock x:Name="ResultLogPath" Text="" Foreground="#7A8992" FontSize="10" Margin="0,12,0,0" TextWrapping="Wrap"/>
     <StackPanel Orientation="Horizontal" HorizontalAlignment="Right" Margin="0,18,0,0"><Button x:Name="ResultCopyButton" Content="Copy details"/><Button x:Name="ResultOpenLogButton" Content="Open log"/><Button x:Name="ResultCloseButton" Content="OK" MinWidth="85" Background="#0A8FA1" Foreground="White" BorderBrush="#0A8FA1"/></StackPanel>
    </StackPanel>
   </Border>
  </Grid>
 </Grid>
</Window>
'@
$reader=New-Object System.Xml.XmlNodeReader $xaml
$window=[Windows.Markup.XamlReader]::Load($reader)
$names=@('VersionText','PgPasswordBox','StepPreflight','StepBackup','StepDeploy','StepMigrate','StepStart','StepHealth','Progress','StatusText','LogBox','CopyErrorButton','OpenLogButton','FooterText','CloseButton','InstallButton','ResultOverlay','ResultBadge','ResultKind','ResultTitle','ResultMessage','ResultLogPath','ResultCopyButton','ResultOpenLogButton','ResultCloseButton')
foreach($name in $names){Set-Variable -Name $name -Value $window.FindName($name) -Scope Script}
$VersionText.Text=$version
$script:worker=$null; $script:lastStatusCount=0; $script:lastError=''

function Set-StepState([string]$Stage,[string]$State){$map=@{'Preflight'=$StepPreflight;'Backup'=$StepBackup;'Deploy'=$StepDeploy;'Migrate'=$StepMigrate;'Start'=$StepStart;'Health Check'=$StepHealth};$box=$map[$Stage];if(-not $box){return};switch($State){'RUNNING'{$box.Background='#FFF0C2'}'SUCCESS'{$box.Background='#D9F1E4'}'FAILED'{$box.Background='#F8D9D7'}default{$box.Background='#EDF2F6'}}}
function Save-CredentialFile {Remove-Item $credentialFile -Force -ErrorAction SilentlyContinue;$plain=$PgPasswordBox.Password;if([string]::IsNullOrWhiteSpace($plain)){return ''};Add-Type -AssemblyName System.Security -ErrorAction SilentlyContinue;$bytes=[Text.Encoding]::UTF8.GetBytes($plain);$blob=[Security.Cryptography.ProtectedData]::Protect($bytes,$null,[Security.Cryptography.DataProtectionScope]::LocalMachine);('DPAPI-MACHINE:'+[Convert]::ToBase64String($blob))|Set-Content $credentialFile -Encoding ASCII;return $credentialFile}
function Read-SharedText([string]$Path) {
  if(-not(Test-Path -LiteralPath $Path)){return ''}
  $stream=$null;$reader=$null
  try {
    $share=[System.IO.FileShare]([int][System.IO.FileShare]::ReadWrite -bor [int][System.IO.FileShare]::Delete)
    $stream=New-Object System.IO.FileStream -ArgumentList @($Path,[System.IO.FileMode]::Open,[System.IO.FileAccess]::Read,$share)
    $reader=New-Object System.IO.StreamReader($stream,[System.Text.Encoding]::UTF8,$true)
    return $reader.ReadToEnd()
  } finally {
    if($reader){$reader.Dispose()} elseif($stream){$stream.Dispose()}
  }
}
function Refresh-LogBox {
  try {
    $text=Read-SharedText $logFile
    if([string]::IsNullOrEmpty($text)){return}
    $all=@($text -split "`r?`n")
    if($all.Count -gt 120){$all=$all[($all.Count-120)..($all.Count-1)]}
    $LogBox.Text=$all -join "`r`n"
    $LogBox.ScrollToEnd()
  } catch {}
}
function Show-Result([bool]$Success,[string]$Message){if($Success){$ResultBadge.Background='#E1F3E9';$ResultKind.Text='SUCCESS';$ResultKind.Foreground='#176844';$ResultTitle.Text='Production installation completed';$ResultMessage.Text=$Message}else{$ResultBadge.Background='#FBE3E1';$ResultKind.Text='FAILED';$ResultKind.Foreground='#A52C25';$ResultTitle.Text='Installation stopped safely';$ResultMessage.Text=$Message};$ResultLogPath.Text="Log: $logFile";$ResultOverlay.Visibility='Visible'}
function Open-Log {
  if(-not(Test-Path -LiteralPath $logFile)){return}
  try {
    $snapshot=Join-Path $runtimeRoot ("installer-log-view-{0}-{1}.txt" -f (Get-Date -Format 'yyyyMMdd-HHmmss'),[Guid]::NewGuid().ToString('N').Substring(0,6))
    [System.IO.File]::WriteAllText($snapshot,(Read-SharedText $logFile),(New-Object System.Text.UTF8Encoding($true)))
    Start-Process notepad.exe -ArgumentList @($snapshot)
  } catch {
    Start-Process notepad.exe -ArgumentList @($logFile)
  }
}
$OpenLogButton.Add_Click({Open-Log});$ResultOpenLogButton.Add_Click({Open-Log});$ResultCloseButton.Add_Click({$ResultOverlay.Visibility='Collapsed'})
$CopyErrorButton.Add_Click({if($script:lastError){[Windows.Clipboard]::SetText($script:lastError)}});$ResultCopyButton.Add_Click({$text="$($ResultTitle.Text)`r`n$($ResultMessage.Text)`r`n$($ResultLogPath.Text)";[Windows.Clipboard]::SetText($text)})
$CloseButton.Add_Click({if($script:worker -and -not $script:worker.HasExited){Show-Result $false 'Installation is still running. Wait for it to finish before closing the window.'}else{$window.Close()}})

$timer=New-Object Windows.Threading.DispatcherTimer;$timer.Interval=[TimeSpan]::FromMilliseconds(500)
$timer.Add_Tick({
 Refresh-LogBox
 if(Test-Path $statusFile){$statusFileText=Read-SharedText $statusFile;$statusLines=@($statusFileText -split "`r?`n"|Where-Object{$_});if($statusLines.Count -gt $script:lastStatusCount){for($i=$script:lastStatusCount;$i -lt $statusLines.Count;$i++){try{$event=$statusLines[$i]|ConvertFrom-Json;Set-StepState $event.stage $event.state;$StatusText.Text=("{0} - {1} {2}" -f $event.stage,$event.state,$event.message);if($event.state -eq 'FAILED'){$script:lastError=$event.message;$CopyErrorButton.IsEnabled=$true}}catch{}};$script:lastStatusCount=$statusLines.Count;$success=@($statusLines|ForEach-Object{try{$_|ConvertFrom-Json}catch{}}|Where-Object{$_.state -eq 'SUCCESS' -and $_.stage -in @('Preflight','Backup','Deploy','Migrate','Start','Health Check')}).Count;$Progress.Value=[Math]::Min(95,$success*16)}}
 if($script:worker -and $script:worker.HasExited){$timer.Stop();$InstallButton.IsEnabled=$true;$PgPasswordBox.IsEnabled=$true;Remove-Item $credentialFile -Force -ErrorAction SilentlyContinue;if($script:worker.ExitCode -eq 0){$Progress.Value=100;$StatusText.Text='Production installation completed successfully.';$FooterText.Text='Production is ready at http://localhost:3000';Show-Result $true 'Backup, deployment, migration, start and health check completed successfully.'}else{if(-not $script:lastError){$script:lastError='The installer worker exited with an error. Review the log for the final details.'};$StatusText.Text='Installation stopped. Review the log.';$FooterText.Text='Production installation stopped safely. Existing backups were retained.';Show-Result $false $script:lastError};$script:worker=$null}
})

# Keep all installer callbacks inside a try/catch. PowerShell surfaces uncaught
# WPF button errors at $window.ShowDialog(), hiding the real failure location.
$InstallButton.Add_Click({
  try {
    $answer=[Windows.MessageBox]::Show("Install or upgrade PRODUCTION now?`n`nA source backup and database backup will be created first. This package can deploy Production only.",'Production confirmation','YesNo','Warning')
    if($answer -ne 'Yes'){return}
    Remove-Item $logFile,$statusFile -Force -ErrorAction SilentlyContinue
    foreach($stage in @('Preflight','Backup','Deploy','Migrate','Start','Health Check')){Set-StepState $stage 'PENDING'}
    $Progress.Value=2;$StatusText.Text='Starting Production installer...';$FooterText.Text='Installation is running. Do not close this window.'
    $InstallButton.IsEnabled=$false;$PgPasswordBox.IsEnabled=$false;$CopyErrorButton.IsEnabled=$false
    $script:lastError='';$script:lastStatusCount=0
    $credentialPath=Save-CredentialFile
    $workerPath=Join-Path $PSScriptRoot 'production-installer-worker.ps1'
    if(-not(Test-Path -LiteralPath $sourceRoot -PathType Container)){throw "Installer source folder is not accessible: $sourceRoot. Extract the ZIP to C:\HealthCheckInstaller and retry."}
    if(-not(Test-Path -LiteralPath $workerPath -PathType Leaf)){throw "Installer worker script is missing: $workerPath. Extract the entire ZIP and retry."}
    if(-not(Test-Path -LiteralPath $runtimeRoot -PathType Container)){throw "Installer temporary folder does not exist: $runtimeRoot"}
    $powershellExe=Join-Path $PSHOME 'powershell.exe'
    if(-not(Test-Path -LiteralPath $powershellExe -PathType Leaf)){throw "Windows PowerShell executable not found: $powershellExe"}
    $arguments=@('-NoProfile','-ExecutionPolicy','Bypass','-File',('"{0}"' -f $workerPath),'-LogFile',('"{0}"' -f $logFile),'-StatusFile',('"{0}"' -f $statusFile))
    if($credentialPath){$arguments+=@('-PgCredentialFile',('"{0}"' -f $credentialPath))}
    # Use a verified scratch directory, not an elevated session's possibly-invalid
    # shortened C:\Users\... alias. The worker resolves source files via $PSScriptRoot.
    $script:worker=Start-Process -FilePath $powershellExe -ArgumentList ($arguments -join ' ') -WorkingDirectory $runtimeRoot -WindowStyle Hidden -PassThru -ErrorAction Stop
    $timer.Start()
  } catch {
    $message="Cannot launch Production installer: $($_.Exception.Message)"
    $script:lastError=$message;$CopyErrorButton.IsEnabled=$true
    $InstallButton.IsEnabled=$true;$PgPasswordBox.IsEnabled=$true
    $StatusText.Text='Could not start the installer. Production files were not changed.'
    $FooterText.Text='Extract the ZIP to C:\HealthCheckInstaller and retry if the downloaded folder path is inaccessible.'
    try {Remove-Item $credentialFile -Force -ErrorAction SilentlyContinue} catch {}
    try {[System.IO.File]::AppendAllText($logFile,"[$(Get-Date -Format 's')] $message`r`n",[System.Text.Encoding]::UTF8)} catch {}
    Show-Result $false $message
  }
})

$window.Add_Closing({if($script:worker -and -not $script:worker.HasExited){$_.Cancel=$true;Show-Result $false 'Production installation is still running. This window will remain open until the worker finishes.'}else{Remove-Item $credentialFile -Force -ErrorAction SilentlyContinue}})
try { $window.ShowDialog() | Out-Null } catch {
  $message="Installer window error: $($_.Exception.Message)"
  try {[System.IO.File]::AppendAllText($logFile,"[$(Get-Date -Format 's')] $message`r`n",[System.Text.Encoding]::UTF8)} catch {}
  Write-Host $message -ForegroundColor Red
  [Windows.MessageBox]::Show("$message`n`nTry extracting the ZIP to C:\HealthCheckInstaller and run INSTALL-REPAIR.bat as administrator.",'HealthCheck Installer Error','OK','Error') | Out-Null
  exit 1
}
