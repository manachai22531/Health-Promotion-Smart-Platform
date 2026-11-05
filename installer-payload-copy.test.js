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
