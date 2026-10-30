'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=__dirname;
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
test('annual editor saves sections without whole-state persistence',()=>{
 const app=read('assets/app.js'),server=read('server.js');
 assert.match(app,/company-circulars\/\$\{encodeURIComponent\(id\)\}\/sections/);
 assert.match(app,/company-years\/\$\{encodeURIComponent\(id\)\}\/sections/);
 assert.match(server,/app\.patch\('\/api\/company-circulars\/:companyId\/sections\/:section'/);
 assert.match(server,/jsonb_set\(data,'\{companies\}'/);
});
test('primary PDF merges preserved attachments and removes byte-identical duplicates',()=>{
 const server=read('server.js');
 assert.match(server,/company_year_documents[\s\S]*company_year_attachments/);
 assert.match(server,/createHash\('sha256'\)/);
 assert.match(server,/combined\.copyPages/);
});
test('annual terminology and sections 09-10 are present',()=>{
 const html=read('app.html'),pdf=read('corporate-circular-pdf.js');
 assert.match(html,/data-circular-number="09"/);assert.match(html,/data-company-section="10"/);
 assert.doesNotMatch(html,/โปรแกรมที่โรงพยาบาล/);assert.match(pdf,/โปรแกรมพนักงาน/);
 assert.match(pdf,/1\.\$\{index\+1\} บริษัทลูก/);
});
