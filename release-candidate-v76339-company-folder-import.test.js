'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('app.html','utf8');
const app=fs.readFileSync('assets/app.js','utf8');
const server=fs.readFileSync('server.js','utf8');
const installer=fs.readFileSync('INSTALL-REPAIR.bat','utf8');

test('release is v7.63.44 production-only',()=>{
  assert.match(server,/RELEASE_NAME = 'v7\.63\.44-production'/);
  assert.match(server,/const RUNTIME_ENVIRONMENT = 'production'/);
});

test('company toolbar uses company-folder import and the new template',()=>{
  assert.match(html,/id="openMultiCompanyImport"[\s\S]{0,120}นำเข้าหลายบริษัท/);
  assert.match(html,/templates\/company-folder-import-template\.xlsx/);
  for(const header of ['CompanyName','CompanyCode','Year','StartDate','EndDate','BillingPackages','CashPackages','PDFPath','Note','ReportCondition','SalesOfficer']) assert.match(html,new RegExp(header));
});

test('company-folder parser maps annual metadata, packages, pdf path and sales officer',()=>{
  const start=app.indexOf('function parseMultiCompany(file)');
  const end=app.indexOf('function validateMultiCompanyGroups',start);
  const flow=app.slice(start,end);
  assert.ok(start>0&&end>start);
  assert.match(flow,/checkupStartDate/);
  assert.match(flow,/checkupEndDate/);
  assert.match(flow,/billingPackages/);
  assert.match(flow,/cashPackages/);
  assert.match(flow,/pdfPath/);
  assert.match(flow,/reportConditions/);
  assert.match(flow,/salesName/);
  assert.match(flow,/salesPhone/);
});

test('company-folder state update preserves customer records',()=>{
  const start=app.indexOf('function buildMultiCompanyState(groups)');
  const end=app.indexOf('async function backupStateBeforeMultiCompanyImport',start);
  const flow=app.slice(start,end);
  assert.ok(start>0&&end>start);
  assert.doesNotMatch(flow,/next\.records\s*=/);
  assert.match(flow,/next\.companies\.push/);
});

test('successful company import does not embed follow-on customer upload in the import modal',()=>{
  assert.doesNotMatch(html,/id="companyImportNextStep"/);
  assert.doesNotMatch(app,/renderCompanyImportNextStep/);
  assert.match(app,/close\('multiCompanyImportOverlay'\)/);
});

test('PDFPath is imported by the Production server with PDF and size validation',()=>{
  assert.match(server,/\/api\/company-documents\/import-paths/);
  assert.match(server,/path\.win32\.isAbsolute/);
  assert.match(server,/20\*1024\*1024/);
  assert.match(server,/%PDF-/);
  assert.match(server,/company_year_documents/);
});

test('root installer launches the hardened Production installer',()=>{
  assert.match(installer,/tools\\start-production-installer\.vbs/i);
  assert.match(installer,/wscript\.exe/i);
});
