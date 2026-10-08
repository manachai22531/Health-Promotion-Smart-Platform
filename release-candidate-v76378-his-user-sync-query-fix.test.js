'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=__dirname;
const read=f=>fs.readFileSync(path.join(root,f),'utf8');

test('v7.63.78 release identity remains production/update-center compatible',()=>{
  const pkg=JSON.parse(read('package.json')),lock=JSON.parse(read('package-lock.json')),server=read('server.js'),html=read('app.html');
  assert.equal(pkg.version,'7.63.78');
  assert.equal(lock.version,'7.63.78');
  assert.equal(lock.packages[''].version,'7.63.78');
  assert.equal(read('VERSION.txt').trim(),'v7.63.78');
  assert.match(server,/RELEASE_NAME = 'v7\.63\.78-production'/);
  assert.match(server,/RUNTIME_ENVIRONMENT = 'production'/);
  assert.match(server,/PRODUCTION_PORT = 3000/);
  assert.match(html,/assets\/style\.css\?v=7\.63\.78-his-user-sync-query-fix/);
  for(const f of ['server.js','package.json','VERSION.txt','INSTALL-REPAIR.bat']) assert.ok(fs.existsSync(path.join(root,f)),`${f} missing`);
});

test('HIS user query keeps active/current-date filter and type-safe LOV join',()=>{
  const server=read('server.js');
  assert.match(server,/CURRENT_DATE/);
  assert.match(server,/lovcptypid/);
  assert.match(server,/LEFT JOIN \$\{lovTable\} l ON l\."id"::text = \$\{hisQuotedColumn\('u',fields\.lovCpTypeId\)\}::text/);
  assert.match(server,/"userTypeCode"/);
  assert.match(server,/"userTypeName"/);
});

test('HIS sync surfaces PostgreSQL error details',()=>{
  const server=read('server.js'),app=read('assets/app.js');
  assert.match(server,/HIS user sync failed/);
  assert.match(server,/ดึงข้อมูล User จาก HIS ไม่สำเร็จ: \$\{error\.message\|\|error\}/);
  assert.match(app,/\[result\.error,result\.detail\]/);
});
