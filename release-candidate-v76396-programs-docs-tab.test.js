'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const html=fs.readFileSync('app.html','utf8'),css=fs.readFileSync('assets/style.css','utf8'),app=fs.readFileSync('assets/app.js','utf8');
const Module=require('node:module'),originalLoad=Module._load;
let pdf;try{Module._load=function(name,...args){if(name==='pdf-lib')return {PDFDocument:{},rgb:()=>({})};if(name==='@pdf-lib/fontkit')return {};return originalLoad.call(this,name,...args)};pdf=require('./corporate-circular-pdf')}finally{Module._load=originalLoad}
const section=(a,b)=>html.slice(html.indexOf(a),html.indexOf(b,html.indexOf(a)));
test('v7.63.97 release and migration preservation',()=>{
 assert.equal(require('./package.json').version,'7.63.97');
 assert.match(fs.readFileSync('server.js','utf8'),/RELEASE_NAME = 'v7\.63\.97-production'/);
 assert.match(html,/app\.js\?v=7\.63\.97/);
 assert.match(fs.readFileSync('server.js','utf8'),/const SCHEMA_VERSION = '0211'/);
 assert.ok(fs.existsSync('tools/app-update-helper.js'));
 assert.ok(fs.existsSync('INSTALL-REPAIR.bat'));
});
test('00-08 unchanged, separate docs nav and upload now lives in Docs section',()=>{
 const body=section('id="companyOverlay"','id="importOverlay"');
 assert.deepEqual([...body.matchAll(/data-circular-number="(\d\d)"/g)].map(m=>m[1]),['00','01','02','03','04','05','06','07','08']);
 assert.match(body,/data-company-section="docs"/);
 const docs=section('id="companyYearAttachmentsSection"','<div class="company-year-v76395-right">');
 for(const id of ['companyAttachmentFile','uploadCompanyAttachments','companyAttachmentList'])assert.ok(docs.includes(`id="${id}"`),id);
 const hub=section('id="companyYearDocumentHub"','id="companyCircularEditor"');
 assert.ok(!hub.includes('id="companyAttachmentFile"'));
 assert.ok(hub.includes('id="companyMainPdfCurrent"'));
 assert.match(app,/key==='docs'\?\$\('#companyYearAttachmentsSection'\)/);
});
test('04 hospital/family program tables are above billing and cash tables',()=>{
 const part=section('data-circular-number="04"','data-circular-number="05"');
 assert.ok(part.indexOf('id="annualProgramEditor"')<part.indexOf('id="billingPackageRows"'));
 assert.ok(part.indexOf('id="billingPackageRows"')<part.indexOf('id="cashPackageRows"'));
 for(const id of ['annualHospitalProgramRows','annualFamilyProgramRows','addBillingPackage','addCashPackage','companyHisPackageOptions']){
   assert.ok((id==='companyHisPackageOptions'?html:part).includes(`id="${id}"`),id);
 }
 assert.match(app,/function findCompanyHisPackage/);
 assert.match(app,/function updateAnnualProgramRowV76396/);
 assert.match(app,/function renderAnnualProgramsV76396/);
 assert.match(css,/annual-program-row/);
});
test('HIS package price and quantity preserved for PDF memo after normalize and restore',()=>{
 const memo=pdf.normalizeCircular({hospitalPrograms:[{name:'HIS Program',code:'H001',quantity:3,unitPrice:200,price:'600'}],familyPrograms:[{name:'Family Program',price:'1000',code:'F003',quantity:2,unitPrice:500}]});
 assert.equal(memo.hospitalPrograms[0].quantity,3);
 assert.equal(memo.hospitalPrograms[0].unitPrice,200);
 assert.equal(memo.hospitalPrograms[0].price,'600');
 assert.equal(memo.familyPrograms[0].quantity,2);
 assert.equal(memo.familyPrograms[0].unitPrice,500);
 const old=pdf.normalizeCircular({hospitalPrograms:[{name:'original',price:'200',code:'OLD'}]});
 assert.equal(old.hospitalPrograms[0].quantity,1);
 assert.equal(old.hospitalPrograms[0].code,'OLD');
});
test('original company-year PDF uploads and main-document history still use their own endpoints',()=>{
 const server=fs.readFileSync('server.js','utf8');
 for(const term of ['CREATE TABLE IF NOT EXISTS company_year_documents','CREATE TABLE IF NOT EXISTS company_year_attachments','CREATE TABLE IF NOT EXISTS company_year_primary_pdfs','/api/company-attachments/:companyId','/api/company-primary-pdfs/:companyId'])assert.ok(server.includes(term));
 assert.match(app,/fetch\(`\/api\/company-attachments\/\$\{encodeURIComponent\(id\)\}`/);
});
