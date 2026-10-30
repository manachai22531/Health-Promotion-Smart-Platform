'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=(file)=>fs.readFileSync(path.join(__dirname,file),'utf8');
test('all release identities agree, including installer and browser cache busting',()=>{
 const pkg=JSON.parse(read('package.json'));
 const lock=JSON.parse(read('package-lock.json'));
 assert.equal(pkg.version,'7.64.17');
 assert.equal(lock.version,'7.64.17');
 assert.equal(lock.packages[''].version,'7.64.17');
 assert.equal(read('VERSION.txt').trim(),'v7.64.17');
 assert.match(read('server.js'),/const RELEASE_NAME = 'v7\.64\.17-production';/);
 assert.match(read('tools/production-installer-worker.ps1'),/\$version='v7\.64\.17'/);
 assert.match(read('app.html'),/assets\/app\.js\?v=7\.64\.17-production-a4-visibility-guard/);
 assert.match(read('app.html'),/assets\/flow-v76384\.js\?v=7\.64\.17-production-order-gate/);
});
test('pending cases require HIS Order success before appearing in today list',()=>{
 const api=read('server.js'), flow=read('assets/flow-v76384.js');
 assert.match(api,/worklistStage\(recordMap\.get/);
 assert.match(flow,/pending=items\.filter\(x=>x\.workflow_stage==='PENDING_ORDER'\)/);
 assert.match(flow,/confirmed=items\.filter\(x=>x\.workflow_stage==='ORDERED'\)/);
 assert.match(flow,/เปิดข้อมูล \/ สั่ง Order/);
});
test('PDF fast save endpoint is scoped and guarded; pdf failure is distinct',()=>{
 const api=read('server.js'),client=read('assets/app.js');
 assert.match(api,/app\.post\('\/api\/company-years\/:companyId\/save-and-generate-pdf',localOnly,staffPermissionRequired\('companyEdit'\)/);
 assert.match(api,/saved:true,revision,error:'บันทึกข้อมูลสำเร็จ แต่สร้าง PDF ไม่สำเร็จ'/);
 assert.match(client,/suppressStateSaveForCircular=true/);
 assert.match(client,/save-and-generate-pdf/);
});
test('installer targets production only, has version healthcheck, and excludes unrelated process',()=>{
 const worker=read('tools/production-installer-worker.ps1'), updater=read('tools/app-update-helper.js');
 assert.match(worker,/\$targetRoot='D:\\HealthCheck\\Production'/);
 assert.match(worker,/\$port=3000/);
 assert.match(worker,/Payload version mismatch/);
 assert.match(worker,/Wait-Health/);
 assert.match(updater,/classifyRecovery/);
 assert.match(updater,/failedPhase/);
 assert.ok(fs.existsSync(path.join(__dirname,'INSTALL-REPAIR.bat')));
});
