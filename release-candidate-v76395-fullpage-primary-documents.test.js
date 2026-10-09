'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const server=fs.readFileSync('server.js','utf8'),html=fs.readFileSync('app.html','utf8'),app=fs.readFileSync('assets/app.js','utf8'),css=fs.readFileSync('assets/style.css','utf8');
test('v7.63.97 production identity and compatible update artifacts',()=>{
 assert.match(server,/RELEASE_NAME = 'v7\.(?:63\.99|64\.\d+)-production'/);
 assert.equal(JSON.parse(fs.readFileSync('package.json','utf8')).version,require('./package.json').version);
 assert.equal(JSON.parse(fs.readFileSync('package-lock.json','utf8')).version,require('./package.json').version);
 assert.match(html,/app\.js\?v=7\.(?:63\.99|64\.\d+)/);
 assert.ok(fs.existsSync('INSTALL-REPAIR.bat'));
 assert.ok(fs.existsSync('tools/app-update-helper.js'));
 assert.ok(fs.existsSync('templates/corporate-circular-template.pdf'));
});
test('full page layout retains all 00-08 and anchors PDF management',()=>{
 const section=html.slice(html.indexOf('id="companyOverlay"'),html.indexOf('id="importOverlay"'));
 assert.match(section,/company-year-v76395-fullpage/);
 assert.deepEqual([...section.matchAll(/data-circular-number="(\d\d)"/g)].map(x=>x[1]),['00','01','02','03','04','05','06','07','08','09','10']);
 assert.equal((section.match(/id="companyYearDocumentHub"/g)||[]).length,1);
 assert.match(css,/#companyOverlay\.overlay\{inset:0!important/);
 assert.match(section,/id="companyAttachmentFile"[^>]*multiple/);
 assert.match(section,/id="companyGeneratePrimaryPdf"/);
 assert.match(section,/id="companyGeneratePrimaryPdfFooter"/);
});
test('old PDFs remain intact; new attachments and PDF history have distinct tables',()=>{
 assert.match(server,/CREATE TABLE IF NOT EXISTS company_year_documents/);
 assert.match(server,/CREATE TABLE IF NOT EXISTS company_year_attachments/);
 assert.match(server,/CREATE TABLE IF NOT EXISTS company_year_primary_pdfs/);
 assert.match(server,/legacy\.rows\.map\(f=>\(\{\.\.\.f,id:'legacy'/);
 assert.match(server,/if\(!\/\^\[1-9\]\[0-9\]\*\$\/\.test\(attachmentId\)\)/);
 assert.match(server,/buildCircularWithCompanyAttachments/);
 for(const route of ['/api/company-primary-pdfs/:companyId','/api/company-primary-pdfs/:companyId/file/:versionId','/api/company-attachments/:companyId','/api/company-attachments/:companyId/file/:attachmentId'])assert.ok(server.includes(route),route);
});
test('attachment upload never calls old legacy overwrite endpoint',()=>{
 const newlyAdded=app.slice(app.indexOf('// v7.63.95 - Full Page annual editor'));
 assert.match(newlyAdded,/method:'POST'/);
 assert.match(newlyAdded,/\/api\/company-attachments\/\$\{encodeURIComponent\(id\)\}/);
 assert.doesNotMatch(newlyAdded,/method:'PUT'/);
 assert.match(newlyAdded,/await saveCircularBackendV76393/);
 assert.match(newlyAdded,/await persistStateNow\(\)/);
});
test('other company and customer screens use primary PDF first, legacy fallback',()=>{
 assert.match(app,/companyPrimaryDocuments\.has\(String\(companyId\)\)/);
 assert.match(app,/\/api\/company-primary-pdfs\/\$\{encodeURIComponent\(companyId\)\}\/file\/latest/);
 assert.match(server,/app\.get\('\/api\/company-primary-pdfs',localOnly,staffPermissionRequired\('companyPdfView'\)/);
 assert.match(app,/syncFullPageScale\(\)/);
 assert.match(app,/#companyOverlay\.open/);
});
