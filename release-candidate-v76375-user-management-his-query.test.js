'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=__dirname;
const read=f=>fs.readFileSync(path.join(root,f),'utf8');

test('v7.63.75 release identity and installer roots stay Production compatible',()=>{
  const pkg=JSON.parse(read('package.json')),lock=JSON.parse(read('package-lock.json')),server=read('server.js'),html=read('app.html');
  assert.equal(pkg.version,'7.63.75');
  assert.equal(lock.version,'7.63.75');
  assert.equal(lock.packages[''].version,'7.63.75');
  assert.equal(read('VERSION.txt').trim(),'v7.63.75');
  assert.match(server,/RELEASE_NAME = 'v7\.63\.75-production'/);
  assert.match(server,/RUNTIME_ENVIRONMENT = 'production'/);
  assert.match(server,/PRODUCTION_PORT = 3000/);
  assert.match(html,/assets\/style\.css\?v=7\.63\.75-user-management-his-query/);
  assert.match(html,/assets\/app\.js\?v=7\.63\.75-user-management-his-query/);
  for(const f of ['server.js','package.json','VERSION.txt','INSTALL-REPAIR.bat']) assert.ok(fs.existsSync(path.join(root,f)),`${f} missing`);
});

test('HIS User query is inspectable without exposing credentials',()=>{
  const server=read('server.js'),html=read('app.html'),js=read('assets/app.js');
  assert.match(server,/function buildHisDirectoryUserQuery/);
  assert.match(server,/app\.get\('\/api\/his-users\/query'/);
  assert.match(server,/information_schema\.columns/);
  assert.match(server,/LIMIT 5000/);
  assert.match(html,/id="showHisUserQuery"/);
  assert.match(html,/id="hisUserQueryPreview"/);
  assert.match(html,/ตาราง User \(HIS\)/);
  assert.match(js,/loadHisUserQueryV76375/);
  assert.doesNotMatch(server,/source:\{[^}]*password/);
});

test('bulk user delete has server-side safeguards and audit',()=>{
  const server=read('server.js'),html=read('app.html'),js=read('assets/app.js');
  assert.match(server,/app\.post\('\/api\/users\/bulk-delete'/);
  assert.match(server,/staffPermissionRequired\('userDelete'\)/);
  assert.match(server,/บัญชีนี้กำลัง Login อยู่/);
  assert.match(server,/Administrator คนสุดท้าย/);
  assert.match(server,/ลบบัญชีผู้ใช้หลายคน/);
  assert.match(html,/id="selectAllVisibleUsers"/);
  assert.match(html,/id="bulkDeleteUsers"/);
  assert.match(html,/id="userBulkDeleteOverlay"/);
  assert.match(js,/selectedUserIdsV76375/);
  assert.match(js,/deleteUsersV76375/);
});

test('operations center uses supplied custom icon',()=>{
  const html=read('app.html');
  assert.match(html,/assets\/nav\/operations-center\.png/);
  assert.ok(fs.statSync(path.join(root,'assets/nav/operations-center.png')).size>1000);
});

test('v7.63.74 readiness and previous operations features remain present',()=>{
  const server=read('server.js'),html=read('app.html');
  assert.match(html,/Production Readiness Pack/);
  assert.match(server,/app\.post\('\/api\/ops\/readiness\/load-test'/);
  assert.match(server,/OPERATIONS_JOB_TYPES=new Set/);
  assert.match(server,/app\.post\('\/api\/his-users\/sync'/);
});
