"use strict";
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=__dirname;
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
test('v7.64.17 release metadata agrees across server installer package lock and app',()=>{
 const pkg=JSON.parse(read('package.json'));
 const lock=JSON.parse(read('package-lock.json'));
 assert.equal(pkg.version,'7.64.17');
 assert.equal(lock.version,pkg.version);
 assert.equal(lock.packages[''].version,pkg.version);
 assert.equal(read('VERSION.txt').trim(),'v7.64.17');
 assert.match(read('server.js'),/RELEASE_NAME\s*=\s*'v7\.64\.17-production'/);
 assert.match(read('app.html'),/app\.js\?v=7\.64\.17-production/);
 assert.match(read('tools/production-installer-worker.ps1'),/\$version='v7\.64\.17'/);
});
test('company popover UI is installed with event controller and styles',()=>{
 const js=read('assets/customer-search-one-row.js');
 const css=read('assets/style.css');
 assert.match(read('app.html'),/customer-search-one-row\.js\?v=7\.64\.17/);
 assert.match(js,/company/i);
 assert.match(css,/company/i);
});
test('A4 summary is shown before loading HIS packages',()=>{
 const js=read('assets/app.js');
 const start=js.indexOf('showA4Summary=async function(draft){const r=state.records.find(x=>x.key===draft.recordKey);');
 assert.ok(start>=0);
 const body=js.slice(start,start+900);
 assert.ok(body.indexOf('showA4SummaryV41(draft)')<body.indexOf('await Promise.all('));
 assert.match(body,/AbortSignal\.timeout\(6000\)/);
});
test('confirmed worklist fallback uses real confirmations with empty VN',()=>{
 const {buildConfirmedRows}=require('./worklist-confirmed-fallback');
 const rows=buildConfirmedRows({records:[{key:'r',companyId:'c',first:'Test',last:'Case',checkupConfirmedAt:'2026-10-10T03:00:00Z'}],companies:[{id:'c',name:'Example'}],date:'2026-10-10'});
 assert.equal(rows.length,1);
 assert.equal(rows[0].vn,'');
 assert.equal(rows[0].checkin_at,null);
 const server=read('server.js');
 assert.match(server,/require\('\.\/worklist-confirmed-fallback'\)/);
 assert.match(server,/buildConfirmedRows/);
});
test('worklist, section 09 and flowing PDF source remain present',()=>{
 const html=read('app.html');
 const js=read('assets/app.js');
 const pdf=read('corporate-circular-pdf.js');
 assert.match(html,/data-company-section="09"/);
 assert.match(js,/programMatrix/);
 assert.match(pdf,/appendAnnualCircularSections|dynamic|createCircular/);
 assert.ok(fs.existsSync(path.join(root,'assets/flow-v76384.js')));
});
test('Production-only installer and Update Center are included with recovery diagnostics',()=>{
 const ps=read('tools/production-installer-worker.ps1');
 const helper=read('tools/app-update-helper.js');
 assert.match(ps,/D:\\HealthCheck\\Production/);
 assert.match(ps,/\$port=3000/);
 assert.match(helper,/classifyRecovery/);
 assert.match(helper,/failedPhase/);
 assert.ok(fs.existsSync(path.join(root,'INSTALL-REPAIR.bat')));
 assert.ok(fs.existsSync(path.join(root,'tools/check-update-center-readonly.ps1')));
});
