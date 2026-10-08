'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('app.html','utf8');
const app=fs.readFileSync('assets/app.js','utf8');
const server=fs.readFileSync('server.js','utf8');

test('release is v7.63.44 production-only',()=>{
  assert.match(server,/RELEASE_NAME = 'v7\.63\.44-production'/);
  assert.match(server,/const RUNTIME_ENVIRONMENT = 'production'/);
});

test('company folder import updates existing CompanyCode + Year rather than rejecting the code',()=>{
  const validate=app.slice(app.indexOf('function validateMultiCompanyGroups'),app.indexOf('function buildMultiCompanyState'));
  const build=app.slice(app.indexOf('function buildMultiCompanyState'),app.indexOf('function companyFolderPackageExportCell'));
  assert.match(validate,/sameCodeYear/);
  assert.doesNotMatch(validate,/codeConflict/);
  assert.match(build,/norm\(item\.code\)===currentKey&&String\(item\.year\)===String\(group\.year\)/);
  assert.match(build,/Object\.assign\(c,values\)/);
  assert.match(build,/pdfPath:String\(group\.pdfPath\|\|c\?\.pdfPath\|\|''\)/);
});

test('company page has an export button that writes an import-compatible workbook',()=>{
  assert.match(html,/id="exportCompanyFolders"[^>]*>Export ข้อมูลบริษัท/);
  const flow=app.slice(app.indexOf('async function exportCompanyFolders'),app.indexOf('async function backupStateBeforeMultiCompanyImport'));
  for(const header of ['CompanyName','CompanyCode','Year','StartDate','EndDate','BillingPackages','CashPackages','PDFPath','Note','ReportCondition','SalesOfficer']) assert.match(flow,new RegExp(header));
  assert.match(flow,/company-folder-import-template\.xlsx/);
  assert.match(flow,/XLSX\.writeFile/);
});

test('company import modal no longer contains the inline customer-import continuation panel',()=>{
  assert.doesNotMatch(html,/companyImportNextStep/);
  assert.doesNotMatch(html,/companyImportResultList/);
  assert.doesNotMatch(app,/data-import-company-next/);
  assert.match(app,/setTimeout\(\(\)=>close\('multiCompanyImportOverlay'\)/);
});
