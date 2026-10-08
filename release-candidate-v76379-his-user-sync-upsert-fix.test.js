'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=__dirname;
const read=f=>fs.readFileSync(path.join(root,f),'utf8');

test('v7.63.79 release identity remains production/update-center compatible',()=>{
  const pkg=JSON.parse(read('package.json')),lock=JSON.parse(read('package-lock.json')),server=read('server.js'),html=read('app.html');
  assert.equal(pkg.version,'7.63.79');
  assert.equal(lock.version,'7.63.79');
  assert.equal(lock.packages[''].version,'7.63.79');
  assert.equal(read('VERSION.txt').trim(),'v7.63.79');
  assert.match(server,/RELEASE_NAME = 'v7\.63\.79-production'/);
  assert.match(server,/RUNTIME_ENVIRONMENT = 'production'/);
  assert.match(server,/PRODUCTION_PORT = 3000/);
  assert.match(html,/assets\/style\.css\?v=7\.63\.79-his-user-sync-upsert-fix/);
  for(const f of ['server.js','package.json','VERSION.txt','INSTALL-REPAIR.bat']) assert.ok(fs.existsSync(path.join(root,f)),`${f} missing`);
});

test('HIS sync normalizes and deduplicates usernames before persistence',()=>{
  const server=read('server.js');
  assert.match(server,/normalizeUsername=value=>String\(value\|\|''\)\.trim\(\)\.toLowerCase\(\)/);
  assert.match(server,/directoryByUsername=new Map\(\)/);
  assert.match(server,/duplicateHisRows/);
  assert.match(server,/stateDuplicatesMerged/);
  assert.match(server,/existingByUsername\|\|existingByHisId/);
});

test('existing LOCAL users keep manual role and credentials during HIS sync',()=>{
  const server=read('server.js');
  assert.match(server,/const isLocal=String\(existing\.source\|\|''\)\.toUpperCase\(\)==='LOCAL'/);
  assert.match(server,/if\(resolvedRoleId&&!isLocal\)existing\.roleId=resolvedRoleId/);
  assert.doesNotMatch(server,/existing\.passwordHash\s*=/);
  assert.doesNotMatch(server,/existing\.active\s*=\s*false/);
});

test('relational app_users mirror reconciles by normalized username before id upsert',()=>{
  const relational=read('relational-store.js');
  assert.match(relational,/LOWER\(BTRIM\(username\)\)=LOWER\(BTRIM\(\$1\)\)/);
  assert.match(relational,/mirroredUsernames=new Set\(\)/);
  assert.match(relational,/UPDATE app_users SET username=\$2/);
  assert.match(relational,/DELETE FROM app_users WHERE id=\$1/);
});

test('sync UI reports repair counts and technical database details',()=>{
  const app=read('assets/app.js'),server=read('server.js');
  assert.match(app,/duplicateHisRows/);
  assert.match(app,/stateDuplicatesMerged/);
  assert.match(app,/result\.technical\?\.constraint/);
  assert.match(server,/technical:\{code:error\.code\|\|'',constraint:error\.constraint\|\|''/);
});
