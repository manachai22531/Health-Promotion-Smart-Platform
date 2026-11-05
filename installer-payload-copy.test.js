'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const read=p=>fs.readFileSync(p,'utf8');
test('Windows upgrade copies equal-time equal-size release files and verifies bytes before install and launch',()=>{
 const deploy=read('tools/deploy-environment.ps1'),worker=read('tools/production-installer-worker.ps1');
 assert.match(read('tools/app-update-helper.js'),/mirror\?'\/MIR':'\/E','\/IS','\/IT'/);
 assert.match(deploy,/\$args=@\(\$Source,\$Destination,'\/IS','\/IT','\/E'/);
 const verify=deploy.indexOf('Assert-DeployedPayload -SourceRoot');
 assert(verify>deploy.indexOf('Invoke-RobocopySafe -Source'));assert(verify<deploy.indexOf('& $installer'));
 const workerVerify=worker.indexOf('Assert-DeployedPayload -SourceRoot');
 assert(workerVerify>worker.indexOf('Invoke-DeployChild -ScriptPath'));assert(workerVerify<worker.indexOf("Emit 'Start' 'RUNNING'"));
 assert.match(worker,/\$seenVersion -eq \$version/);assert.match(worker,/Test-PayloadIntegrity -Root \$sourceRoot/);
 assert.match(read('tools/assert-deployed-payload.ps1'),/Get-FileHash -LiteralPath \$file -Algorithm SHA256/);
});
