'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=__dirname;
const read=f=>fs.readFileSync(path.join(root,f),'utf8');

test('v7.63.77 release identity remains production/update-center compatible',()=>{
  const pkg=JSON.parse(read('package.json')),lock=JSON.parse(read('package-lock.json')),server=read('server.js'),html=read('app.html');
  assert.equal(pkg.version,'7.63.77');
  assert.equal(lock.version,'7.63.77');
  assert.equal(lock.packages[''].version,'7.63.77');
  assert.equal(read('VERSION.txt').trim(),'v7.63.77');
  assert.match(server,/RELEASE_NAME = 'v7\.63\.77-production'/);
  assert.match(server,/RUNTIME_ENVIRONMENT = 'production'/);
  assert.match(server,/PRODUCTION_PORT = 3000/);
  assert.match(html,/assets\/style\.css\?v=7\.63\.77-user-role-mapping-history/);
  for(const f of ['server.js','package.json','VERSION.txt','INSTALL-REPAIR.bat']) assert.ok(fs.existsSync(path.join(root,f)),`${f} missing`);
});

test('HIS user query includes activeto and lovcptypid mapping through public.lov',()=>{
  const server=read('server.js');
  assert.match(server,/lovcptypid/);
  assert.match(server,/CURRENT_DATE/);
  assert.match(server,/LEFT JOIN \$\{lovTable\} l ON l\."id"/);
  assert.match(server,/"userTypeName"/);
});

test('user management exposes Mapping Role and searchable audit history modal',()=>{
  const html=read('app.html'),app=read('assets/app.js');
  assert.match(html,/id="openHisRoleMapping"[^>]*>Mapping Role</);
  assert.match(html,/id="hisRoleMappingOverlay"/);
  assert.match(html,/id="openPermissionAudit"/);
  assert.match(html,/id="permissionAuditOverlay"/);
  assert.doesNotMatch(html,/id="permissionAuditCard"/);
  assert.match(app,/saveHisRoleMappingV76377/);
  assert.match(app,/renderPermissionAuditV76377/);
});

test('HIS sync uses saved mapping and does not guess role for unmapped users',()=>{
  const server=read('server.js');
  assert.match(server,/hisUserRoleMappings/);
  assert.match(server,/hisRoleMappingStatus:resolvedRoleId\?'MAPPED':'UNMAPPED'/);
  assert.match(server,/roleId:resolvedRoleId/);
});
