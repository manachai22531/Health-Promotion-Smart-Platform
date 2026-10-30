'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const R=__dirname, get=f=>fs.readFileSync(path.join(R,f),'utf8');
test('Production metadata, server response, cache bust and package lock match',()=>{
 const p=JSON.parse(get('package.json')),lock=JSON.parse(get('package-lock.json'));
 assert.match(p.version,/^7\.64\.(?:1[2-9]|[2-9]\d)$/);assert.equal(lock.version,p.version);assert.equal(lock.packages[''].version,p.version);
 assert.equal(get('VERSION.txt').trim(),'v'+p.version);
 assert.ok(get('server.js').includes(`const RELEASE_NAME = 'v${p.version}-production'`));
 assert.ok(get('app.html').includes(`assets/style.css?v=${p.version}-`));
 assert.ok(get('app.html').includes(`assets/app.js?v=${p.version}-`));
});
test('one-line customer search is included with its controller and company lookup',()=>{
 const html=get('app.html'),style=get('assets/style.css'),ctrl=get('assets/customer-search-one-row.js');
 assert.match(html,/id="searchView"/);assert.match(html,/hc-search-one-row/);
 assert.match(html,/id="companyQuickLookupToggle"/);assert.match(html,/id="companyQuickLookup"/);
 assert.ok(html.includes(`assets/customer-search-one-row.js?v=${JSON.parse(get('package.json')).version}`));
 assert.match(style,/hc-search-one-row/);assert.match(ctrl,/companyQuickLookup/);
});
test('Worklist / Section 09 / contacts fixes persist through merges',()=>{
 const app=get('app.html'),style=get('assets/style.css'),js=get('assets/app.js');
 assert.match(app,/worklist-new-layout/);assert.match(app,/worklist-confirmation-panel/);assert.match(app,/worklist-today-panel/);
 assert.match(style,/#worklistView\.workspace-fullpage \.workflow-table-card\.worklist-new-layout\{\s*display:grid!important/);
 assert.match(js,/bindMatrixV76399\(\)/);assert.match(js,/installAnnualSectionSavesV76400\(\)/);
 assert.doesNotMatch(app,/data-save-company-section="09"/);
 assert.match(app,/id="circularCoordinatorRows"/);
});
test('PDF is flowing table 00–08 then 09 and 10, and retains attachments',()=>{
 const pdf=get('corporate-circular-pdf.js'),s=get('corporate-circular-sections.js'),server=get('server.js');
 assert.match(pdf,/appendAnnualCircularSections\(pdf,font,company,d/);
 assert.match(pdf,/drawProgramMatrixPages\(pdf,font,company,d\.programMatrix/);
 assert.match(pdf,/10 รายการตรวจเพิ่มเติม/);
 assert.doesNotMatch(pdf,/PDFDocument\.load\(fs\.readFileSync/);
 assert.match(s,/section\('01','ข้อมูลบริษัท'\)/);assert.match(s,/subheading\(`1\.\$\{i\+1\}/);
 assert.match(server,/mergeCompanyAttachmentPdfsV76401/);
});
test('Production installer GUI path fix and updater remain present',()=>{
 const gui=get('tools/production-installer-gui.ps1'),worker=get('tools/production-installer-worker.ps1');
 assert.match(gui,/function Open-Log/);assert.match(gui,/WorkingDirectory \$safeWorkDir/);
 assert.match(gui,/\$window\.ShowDialog\(\)/);
 assert.match(worker,/Payload version mismatch: installer=/);
 assert.match(worker,/Health Check/);
 assert.match(worker,/\$targetRoot='D:\\HealthCheck\\Production'/);
 assert.ok(fs.existsSync(path.join(R,'tools/app-update-helper.js')));
 assert.ok(fs.existsSync(path.join(R,'tools/app-update-helper.ps1')));
});
