'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=__dirname;
const read=f=>fs.readFileSync(path.join(root,f),'utf8');

test('v7.63.80 mapped-sync feature remains production/update-center compatible in later releases',()=>{
  const pkg=JSON.parse(read('package.json')),lock=JSON.parse(read('package-lock.json')),server=read('server.js'),html=read('app.html');
  const versionParts=String(pkg.version).split('.').map(Number);
  assert.ok(versionParts[0]>7 || (versionParts[0]===7 && (versionParts[1]>63 || (versionParts[1]===63 && versionParts[2]>=80))));
  assert.equal(lock.version,pkg.version);
  assert.equal(lock.packages[''].version,pkg.version);
  assert.equal(read('VERSION.txt').trim(),`v${pkg.version}`);
  assert.match(server,/RELEASE_NAME = 'v7\.(?:63|64)\.\d+-production'/);
  assert.match(server,/RUNTIME_ENVIRONMENT = 'production'/);
  assert.match(server,/PRODUCTION_PORT = 3000/);
  assert.match(html,/assets\/app\.js\?v=7\.(?:63|64)\.\d+-/);
  for(const f of ['server.js','package.json','VERSION.txt','INSTALL-REPAIR.bat']) assert.ok(fs.existsSync(path.join(root,f)),`${f} missing`);
});

test('HIS sync filters mapped lovcptypid before LIMIT',()=>{
  const server=read('server.js');
  assert.match(server,/allowedTypeIds/);
  assert.match(server,/ANY\(\$\$?\{?params\.length\}?::text\[\]\)/);
  assert.match(server,/fetchHisDirectoryUsers\(\{allowedTypeIds\}\)/);
  assert.match(server,/if\(!allowedTypeIds\.length\)return res\.status\(409\)/);
});

test('only active mappings with a valid HealthCheck role are eligible',()=>{
  const server=read('server.js');
  assert.match(server,/mapping\.active!==false/);
  assert.match(server,/validRoleIds\.has\(String\(mapping\.roleId\)\)/);
  assert.match(server,/mappingByType=new Map\(enabledMappings/);
});

test('mapping summary reports mapped population and excluded HIS users',()=>{
  const server=read('server.js'),app=read('assets/app.js');
  assert.match(server,/fetchHisDirectoryPopulationSummary/);
  assert.match(server,/skippedUnmapped/);
  assert.match(server,/skippedInactive/);
  assert.match(server,/skippedExpired/);
  assert.match(app,/พร้อม Sync/);
  assert.match(app,/ไม่ Mapping\/ปิด Mapping/);
  assert.match(app,/หมดอายุ/);
});

test('v7.63.79 idempotent upsert and LOCAL-user protections remain present',()=>{
  const server=read('server.js');
  assert.match(server,/normalizeUsername=value=>String\(value\|\|''\)\.trim\(\)\.toLowerCase\(\)/);
  assert.match(server,/directoryByUsername=new Map\(\)/);
  assert.match(server,/const isLocal=String\(existing\.source\|\|''\)\.toUpperCase\(\)==='LOCAL'/);
  assert.match(server,/if\(!isLocal\)existing\.roleId=resolvedRoleId/);
});
