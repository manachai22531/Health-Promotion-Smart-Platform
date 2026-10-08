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

test('company page button is renamed to นำเข้าหลายบริษัท',()=>{
  assert.match(html,/id="openMultiCompanyImport"[^>]*>นำเข้าหลายบริษัท<\/button>/);
  assert.doesNotMatch(html,/id="openMultiCompanyImport"[^>]*>นำเข้าแฟ้มบริษัท<\/button>/);
});

test('dedicated company code editor changes all years without changing company-year ids',()=>{
  assert.match(html,/id="companyCodeChangeOverlay"/);
  assert.match(html,/id="saveCompanyCodeChange"[^>]*>บันทึก Code ใหม่<\/button>/);
  assert.match(app,/data-change-company-code=/);
  assert.match(app,/fetch\('\/api\/company-code-change'/);
  assert.match(server,/app\.post\('\/api\/company-code-change'/);
  assert.match(server,/SELECT id,source_data FROM company_years WHERE company_id=\$1 ORDER BY screening_year/);
  assert.match(server,/UPDATE company_years SET company_id=\$2,source_data=\$3::jsonb/);
  assert.match(server,/companyYearIds:targetIdList/);
});

test('latest original customer import Excel is retained per company-year and downloadable',()=>{
  assert.match(server,/CREATE TABLE IF NOT EXISTS company_year_import_files/);
  assert.match(server,/company_id TEXT PRIMARY KEY/);
  assert.match(server,/app\.put\('\/api\/company-import-files\/:companyId'/);
  assert.match(server,/app\.get\('\/api\/company-import-files\/:companyId\/file'/);
  assert.match(app,/storeCompanyImportFile\(c\.id,file,imported\.length\)/);
  assert.match(app,/data-company-import-file=/);
  assert.match(app,/companyPdfButton\(c\.id\)\}\$\{companyImportFileButton\(c\.id\)\}/);
});
