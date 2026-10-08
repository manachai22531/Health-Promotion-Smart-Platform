'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=__dirname;
const read=f=>fs.readFileSync(path.join(root,f),'utf8');

test('v7.63.76 release identity remains production/update-center compatible',()=>{
  const pkg=JSON.parse(read('package.json')),lock=JSON.parse(read('package-lock.json')),server=read('server.js'),html=read('app.html');
  assert.equal(pkg.version,'7.63.76');
  assert.equal(lock.version,'7.63.76');
  assert.equal(lock.packages[''].version,'7.63.76');
  assert.equal(read('VERSION.txt').trim(),'v7.63.76');
  assert.match(server,/RELEASE_NAME = 'v7\.63\.76-production'/);
  assert.match(server,/RUNTIME_ENVIRONMENT = 'production'/);
  assert.match(server,/PRODUCTION_PORT = 3000/);
  assert.match(html,/assets\/style\.css\?v=7\.63\.76-user-header-action-label-fix/);
  for(const f of ['server.js','package.json','VERSION.txt','INSTALL-REPAIR.bat']) assert.ok(fs.existsSync(path.join(root,f)),`${f} missing`);
});

test('user table keeps action column but removes visible overflow action header label',()=>{
  const html=read('app.html');
  const marker='<div class="permission-table-head-v76372 user"><span>เลือก</span><span>ลำดับ</span><span>รหัส HIS / Username</span><span>ชื่อ - สกุล</span><span>แผนก</span><span>ตำแหน่ง</span><span>Role</span><span>สถานะ</span><span></span></div>';
  assert.ok(html.includes(marker));
  assert.match(html,/id="userList"/);
  assert.match(html,/id="bulkDeleteUsers"/);
});
