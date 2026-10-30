'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const updater=require('./tools/app-update-helper');
const helper=fs.readFileSync('tools/app-update-helper.js','utf8');
const server=fs.readFileSync('server.js','utf8');
const js=fs.readFileSync('assets/app.js','utf8');
function serving(v){return {version:v,release:v+'-production',environment:'production',productionOnly:true}}
test('windows netstat parser finds the sole listener and rejects ambiguity',()=>{
  const n='  TCP    0.0.0.0:3000    0.0.0.0:0    LISTENING    4290\r\n  TCP    [::]:3000    [::]:0    LISTENING    4290\r\n  TCP    127.0.0.1:5432    0.0.0.0:0    LISTENING    1220\r\n';
  assert.equal(updater.parseNetstatOwner(n),4290);
  assert.equal(updater.parseNetstatOwner(n+'  TCP    127.0.0.1:3000    0.0.0.0:0    LISTENING    2211\r\n'),0);
  assert.equal(updater.parseNetstatOwner(''),0);
});
test('rollback can be considered recovered only when served and disk versions both match',()=>{
  assert.equal(updater.classifyRecovery({currentVersion:'v7.64.11',served:serving('v7.64.11'),installed:'v7.64.11',portOwner:44}).safe,true);
  assert.equal(updater.classifyRecovery({currentVersion:'v7.64.11',served:serving('v7.64.11'),installed:'v7.64.12',portOwner:44}).safe,false);
  assert.equal(updater.classifyRecovery({currentVersion:'v7.64.11',served:serving('v7.64.12'),installed:'v7.64.11',portOwner:44}).safe,false);
  assert.equal(updater.classifyRecovery({currentVersion:'v7.64.11',served:null,installed:'v7.64.11',portOwner:0}).safe,false);
});
test('updater checks same process owns 3000 before STOP and skips unrelated listener on rollback',()=>{
  assert.match(helper,/owner!==pid\)throw Error/);
  assert.match(helper,/Port 3000 owner PID/);
  assert.match(helper,/if\(startedPid&&owner===startedPid\)await stopServer/);
  assert.match(helper,/taskkill\.exe',\['\/PID',String\(targetPid\),'\/F'\]/);
  assert.doesNotMatch(helper.match(/async function stopServer[\s\S]*?function migrationFiles/)[0],/'\/T'/);
});
test('start watches child exit and records diagnostic server log',()=>{
  assert.match(helper,/child.once\('exit'/);
  assert.match(helper,/lastServerLog=path\.join/);
  assert.match(helper,/Port 3000 is already serving/);
  assert.match(helper,/Server startup timed out/);
});
test('package checks all three sources of release version',()=>{
  assert.match(helper,/Package version mismatch/);
  const pkg=require('./package.json');
  assert.equal(pkg.version,'7.64.13');
  assert.equal(require('./package-lock.json').version,'7.64.13');
  assert.equal(fs.readFileSync('VERSION.txt','utf8').trim(),'v7.64.13');
  assert.equal(updater.sourceVersion(process.cwd()),'v7.64.13');
});
test('public status includes failed phase and safe recovery signal for UI',()=>{
  assert.match(server,/failedPhase:status.failedPhase/);
  assert.match(server,/productionKeptRunning:status.productionKeptRunning/);
  assert.match(js,/displayPhase==='PREFLIGHT'\?'PRECHECK'/);
});

test('update helper uses deployment drive for workspace and allows delayed server startup',()=>{ assert.match(helper,/path\.dirname\(root\),'UpdaterWork'/);assert.equal(updater.T.start,120000); });
