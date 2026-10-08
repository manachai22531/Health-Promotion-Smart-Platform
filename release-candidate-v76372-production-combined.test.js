'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=__dirname;
const read=f=>fs.readFileSync(path.join(root,f),'utf8');

test('v7.63.72 booking package name is compact one-line with tooltip',()=>{
  const js=read('assets/app.js'),css=read('assets/style.css');
  assert.match(js,/customer-package-name-ellipsis/);
  assert.match(js,/title=\\?"\$\{esc\(r\.packageName\|\|b\.package_name\|\|'-'\)\}/);
  assert.match(css,/customer-package-name-ellipsis\{[^}]*text-overflow:ellipsis/i);
  assert.match(css,/#bookingOverlay \.booking-customer-table tbody tr\{height:29px/);
});

test('v7.63.72 booking status uses latest HIS patientlog tovalue by HN and VN',()=>{
  const server=read('server.js'),js=read('assets/app.js');
  assert.match(server,/HIS_PATIENT_LOG_TABLE\|\|'patientlog'/);
  assert.match(server,/SELECT DISTINCT ON \(r\.idx\)/);
  assert.match(server,/AS tovalue/);
  assert.match(server,/ORDER BY r\.idx,pl\."\$\{insDateCol\}" DESC NULLS LAST,pl\."\$\{idCol\}" DESC NULLS LAST/);
  assert.match(server,/app\.post\('\/api\/his\/patientlog-status'/);
  assert.match(js,/\/api\/his\/patientlog-status/);
  assert.match(js,/b\.patientlog_status/);
});

test('v7.63.72 booking close button is moved into header and red',()=>{
  const html=read('app.html'),css=read('assets/style.css');
  assert.match(html,/class="modal-close booking-close-button"/);
  assert.match(css,/booking-close-button\{[\s\S]*position:static!important/);
  assert.match(css,/background:linear-gradient\(180deg,#ef5360,#d93645\)!important/);
});

test('v7.63.72 user management is two columns and can sync HIS usermas',()=>{
  const html=read('app.html'),js=read('assets/app.js'),server=read('server.js'),css=read('assets/style.css');
  assert.match(html,/permission-management-grid-v76372/);
  assert.match(html,/Role \(บทบาท\)/);
  assert.match(html,/User \(ผู้ใช้งาน\)/);
  assert.match(html,/id="syncHisUsers"/);
  assert.match(html,/id="addUser"/);
  assert.ok(html.indexOf('id="syncHisUsers"') < html.indexOf('id="addUser"'),'HIS sync button must come before Add User');
  assert.doesNotMatch(html,/class="permission-steps"/);
  assert.match(server,/fetchHisDirectoryUsers/);
  assert.match(server,/doctorTable/);
  assert.match(server,/app\.post\('\/api\/his-users\/sync'/);
  assert.match(js,/ผู้ใช้ใหม่จะยังปิดใช้งานจนกว่าจะกำหนด Role\/รหัสผ่าน/);
  assert.match(css,/permission-management-grid-v76372\{display:grid;grid-template-columns:/);
});

test('v7.63.72 version remains production only and Update Center compatible',()=>{
  const pkg=JSON.parse(read('package.json')),server=read('server.js'),html=read('app.html');
  assert.equal(pkg.version,'7.63.72');
  assert.equal(read('VERSION.txt').trim(),'v7.63.72');
  assert.match(html,/7\.63\.72-production-combined/);
  assert.match(server,/RELEASE_NAME = 'v7\.63\.72-production'/);
  assert.match(server,/RUNTIME_ENVIRONMENT = 'production'/);
  assert.match(server,/PRODUCTION_PORT = 3000/);
  for(const file of ['server.js','package.json','VERSION.txt','INSTALL-REPAIR.bat'])assert.ok(fs.existsSync(path.join(root,file)),file+' missing at root');
});
