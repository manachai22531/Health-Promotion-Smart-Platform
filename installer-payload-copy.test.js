'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const read=p=>fs.readFileSync(p,'utf8');
test('Windows upgrade copies equal-time equal-size release files and verifies bytes before install and launch',()=>{
 const deploy=read('tools/deploy-environment.ps1'),worker=read('tools/production-installer-worker.ps1');
 assert.match(read('tools/app-update-helper.js'),/mirror\?'\/MIR':'\/E','\/IS','\/IT'/);
 assert(!deploy.includes('Invoke-RobocopySafe -Source'));
 const copy=deploy.indexOf('Copy-VerifiedPayload -SourceRoot');
 assert(copy>deploy.indexOf('Deploying application files'));assert(copy<deploy.indexOf('& $installer'));
 const helper=read('tools/assert-deployed-payload.ps1');
 assert.match(helper,/\[IO\.File\]::Copy\(\$entry\.From,\$entry\.To,\$true\)/);
 assert(helper.indexOf('Assert-DeployedPayload -SourceRoot $SourceRoot -TargetRoot $SourceRoot')<helper.indexOf('[IO.File]::Copy'));
 const copyCatch=deploy.slice(copy,deploy.indexOf('$installer=Join-Path'));
 assert(copyCatch.includes('DEPLOY COPY FAILED'));assert(!copyCatch.includes('Start-ExistingServerIfPossible'));
 const workerVerify=worker.indexOf('Assert-DeployedPayload -SourceRoot');
 assert(workerVerify>worker.indexOf('Invoke-DeployChild -ScriptPath'));assert(workerVerify<worker.indexOf("Emit 'Start' 'RUNNING'"));
 assert.match(worker,/\$seenVersion -eq \$version/);assert.match(worker,/Test-PayloadIntegrity -Root \$sourceRoot/);
 assert.match(read('tools/assert-deployed-payload.ps1'),/Get-FileHash -LiteralPath \$file -Algorithm SHA256/);
});
test('installer launcher captures crash output and does not block unattended errors behind a dialog',()=>{
 const launcher=read('tools/run.ps1');
 assert.match(launcher,/-RedirectStandardOutput \$stdoutLog -RedirectStandardError \$stderrLog -PassThru/);
 assert.match(launcher,/\$serverProcess.HasExited/);
 assert.match(launcher,/if\(\$env:HEALTH_CHECK_NONINTERACTIVE -ne '1'\)\{try/);
});
test('installer startup polls the launcher without a native pipeline and retains independent readiness checks',()=>{
 const worker=read('tools/production-installer-worker.ps1'),helper=read('tools/invoke-installer-launcher.ps1');
 assert(!worker.includes('& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $run *>&1'));
 assert.match(worker,/Invoke-InstallerLauncher .* -TimeoutSeconds 120/);
 assert.match(helper,/while\(-not \$process.HasExited\)/);
 assert.match(helper,/\$process.Kill\(\)/);
 assert(!helper.includes('RedirectStandardOutput=$true'));
 assert(worker.indexOf("Emit 'Start' 'SUCCESS'")<worker.indexOf("  Wait-Health\n"));
 assert.match(worker,/\$h.ok -eq \$true -and \[string\]\$h.database -eq 'PostgreSQL'/);
});
test('installer entry and desktop startup use visible PowerShell/UAC without VBScript engines; security validation remains',()=>{
 const batch=read('INSTALL-REPAIR.bat'),bootstrap=read('tools/start-production-installer.ps1'),install=read('tools/install.ps1');
 assert(batch.includes('start-production-installer.ps1'));assert(bootstrap.includes("$launch.Verb='RunAs'"));assert(bootstrap.includes('Get-InstallerLaunchPlan'));
 for(const text of [batch,bootstrap,install])assert(!/wscript\.exe|cscript\.exe|\.vbs\b/i.test(text));
 assert(!/-WindowStyle\s+Hidden|EncodedCommand/i.test(bootstrap));
 assert(install.includes("Join-Path $appRoot 'tools\\run.ps1'"));
 assert(read('tools/production-installer-worker.ps1').includes('Test-PayloadIntegrity -Root $sourceRoot'));
 for(const name of ['INSTALL-REPAIR.vbs','REPAIR-UPDATE-CENTER.vbs','tools/launch.vbs','tools/start-production-installer.vbs'])assert(!fs.existsSync(name));
});
test('source backup readability is checked before stopping Production and reboot is offered only for verified success',()=>{
 const deploy=read('tools/deploy-environment.ps1'),gui=read('tools/production-installer-gui.ps1');
 const probe=deploy.indexOf('Assert-SourceBackupReadable -Plan $backupPlan');assert(probe>0);assert(probe<deploy.indexOf('Stop-TargetServer -Root $targetRoot'));
 assert(gui.includes('Test-InstallerCompleted -ExitCode $script:worker.ExitCode'));
 assert(gui.includes('Invoke-ConfirmedInstallerReboot -InstallSucceeded'));
 assert(gui.includes("'YesNo','Warning','No'"));
 assert.match(gui,/ResultRestartButton"[^>]*Visibility="Collapsed"/);
 assert(!/shutdown\.exe/.test(gui));
});
