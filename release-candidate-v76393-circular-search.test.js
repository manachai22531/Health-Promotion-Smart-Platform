'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,p),'utf8');
test('v7.63.93 keeps Production Only and Windows Update Center',()=>{
  assert.match(read('server.js'),/RELEASE_NAME = 'v7\.63\.93-production'/);
  assert.match(read('server.js'),/RUNTIME_ENVIRONMENT = 'production'/);
  assert.equal(JSON.parse(read('package.json')).version,'7.63.93');
  assert.equal(JSON.parse(read('package-lock.json')).version,'7.63.93');
  for(const p of ['INSTALL-REPAIR.bat','tools/app-update-helper.js','tools/production-installer-worker.ps1','templates/corporate-circular-template.pdf'])assert.ok(fs.existsSync(path.join(__dirname,p)),p);
});
test('annual company year modal contains native circular editor and all legacy fields',()=>{
  const html=read('app.html'),js=read('assets/app.js');
  for(const field of ['companyName','companyYear','companyCheckupStartDate','companyCheckupEndDate','companyReportConditions','companySalesName','billingPackageRows','cashPackageRows','companyCircularEditor','letter_documentNo','letter_hospitalPrograms','letter_familyPrograms','letter_debtorDetails','letter_appendixDetails','previewCircularPdf','downloadCircularPdf'])assert.match(html,new RegExp(`id="${field}"`));
  assert.match(js,/loadCircularBackendV76393/);assert.match(js,/saveCircularBackendV76393/);assert.match(js,/persistStateNow\(\)/);assert.match(js,/api\/company-circulars/);
});
test('corporate circular stored separately per year, rendered from provided template',()=>{
  const server=read('server.js'),module=read('corporate-circular-pdf.js');
  assert.match(server,/company_year_circulars/);assert.match(server,/app\.put\('\/api\/company-circulars\/:companyId'/);
  assert.match(server,/app\.post\('\/api\/company-circulars\/:companyId\/preview'/);
  assert.match(server,/app\.get\('\/api\/company-circulars\/:companyId\/pdf'/);
  assert.match(module,/corporate-circular-template\.pdf/);assert.match(module,/appendixDetails/);
});
test('responsive search limits search field and action widths without hiding Add Customer',()=>{
  const css=read('assets/style.css');
  assert.match(css,/#searchView \.search-grid\{display:grid!important;grid-template-columns:repeat\(5,minmax\(0,1fr\)\)!important/);
  assert.match(css,/#searchView \.search-add-customer\{display:block!important/);
  assert.match(css,/@media\(max-width:490px\)/);
});
