'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const html=fs.readFileSync('app.html','utf8'),app=fs.readFileSync('assets/app.js','utf8'),css=fs.readFileSync('assets/style.css','utf8'),server=fs.readFileSync('server.js','utf8');
const Module=require('node:module'),original=Module._load;
let pdf;try{Module._load=(name,...args)=>{if(name==='pdf-lib')return {PDFDocument:{},rgb:()=>({})};if(name==='@pdf-lib/fontkit')return {};return original(name,...args)};pdf=require('./corporate-circular-pdf')}finally{Module._load=original}
const section=(a,b)=>html.slice(html.indexOf(a),html.indexOf(b,html.indexOf(a)));
test('v7.63.97 Production release, Windows installer and Update Center helpers preserved',()=>{
 assert.match(require('./package.json').version,/^7\.(?:63\.9[789]|64\.\d+)$/);assert.match(server,/RELEASE_NAME = 'v7\.(?:63\.9[789]|64\.\d+)-production'/);
 for(const f of ['INSTALL-REPAIR.bat','tools/app-update-helper.js','templates/corporate-circular-template.pdf'])assert.ok(fs.existsSync(f));
});
test('annual editor uses 00-08 order and subsidiary cards for multiple companies',()=>{
 const view=section('id="companyOverlay"','id="importOverlay"');
 assert.deepEqual([...view.matchAll(/data-circular-number="(\d\d)"/g)].map(m=>m[1]),['00','01','02','03','04','05','06','07','08','09','10']);
 assert.ok(view.includes('id="addCircularSubsidiary"'));assert.ok(view.includes('id="circularSubsidiaryRows"'));
 assert.match(app,/readCircularSubsidiariesV76397\(\)/);assert.match(app,/renderCircularSubsidiariesV76397\(data\.additionalCompanies\|\|\[\]\)/);
});
test('documents stored in circular memo preserve subsidiaries and PDF backend numbers section 1.x',()=>{
 const entry={name:'สาขา 2',nameEn:'Subsidiary B',taxId:'10000000',code:'SUB-B',address:'กรุงเทพฯ',employeeCount:'200'};
 const normalized=pdf.normalizeCircular({additionalCompanies:[entry],hospitalPrograms:[]});
 assert.equal(normalized.additionalCompanies.length,1);assert.equal(normalized.additionalCompanies[0].nameEn,'Subsidiary B');
 assert.equal(pdf.defaultCircular({name:'บริษัทแม่',year:2569},normalized).additionalCompanies[0].code,'SUB-B');
 assert.throws(()=>pdf.normalizeCircular({additionalCompanies:{}}));
 assert.throws(()=>pdf.normalizeCircular({additionalCompanies:Array(21).fill(entry)}));
 const renderer=fs.readFileSync('corporate-circular-pdf.js','utf8');assert.match(renderer,/drawCompanyGroupOne/);assert.match(renderer,/drawCompanySectionContinuation/);
 assert.equal(pdf.subsidiaryNumber(0),'1.1');assert.equal(pdf.subsidiaryNumber(2),'1.3');
});
test('hospital/family programs stack vertically and Package Code box removed',()=>{
 const area=section('id="annualProgramEditor"','id="letter_hospitalPrograms"');
 assert.ok(area.indexOf('id="annualHospitalProgramRows"')<area.indexOf('id="annualFamilyProgramRows"'));
 assert.match(css,/\.annual-program-editor-grid\{display:grid!important;grid-template-columns:minmax\(0,1fr\)!important/);
 assert.match(app,/class="annual-program-code" type="hidden"/);
});
test('right redundant main file card and summary hidden; preview button moved to toolbar',()=>{
 const view=section('id="companyYearDocumentHub"','</aside>');
 assert.match(html,/id="companyYearDocumentHub" hidden/);
 assert.match(html,/id="companyCircularSummary" hidden/);
 assert.match(html,/<header class="company-circular-head">[\s\S]*?id="previewCircularPdf"/);
 assert.doesNotMatch(html,/<div class="company-circular-buttons">/);
});
test('one visible primary save button performs save then PDF create',()=>{
 const footer=section('<footer class="modal-footer"><button class="button secondary" data-close="companyOverlay"','</footer>');
 assert.match(footer,/id="saveCompanyAndPrimary"/);assert.match(footer,/id="saveCompany"[^>]*hidden/);assert.match(footer,/id="companyGeneratePrimaryPdfFooter"[^>]*hidden/);
 assert.match(app,/\$\('#saveCompanyAndPrimary'\)\?\.addEventListener\('click',generateCompanyMainPdfV76395\)/);
 assert.match(app,/const id=await saveCompanyForPrimaryV76395\(\);/);
 assert.match(app,/fetch\(`\/api\/company-primary-pdfs\/\$\{encodeURIComponent\(id\)\}`/);
});
