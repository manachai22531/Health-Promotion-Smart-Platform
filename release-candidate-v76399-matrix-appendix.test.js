'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const root=__dirname,html=fs.readFileSync(`${root}/app.html`,'utf8'),js=fs.readFileSync(`${root}/assets/app.js`,'utf8'),server=fs.readFileSync(`${root}/server.js`,'utf8'),pdfSource=fs.readFileSync(`${root}/corporate-circular-pdf.js`,'utf8');
const Module=require('module'),old=Module._load;
let matrix;
try{Module._load=function(name,...args){if(name==='pdf-lib')return {rgb:(...v)=>v};return old.call(this,name,...args)};matrix=require('./company-program-matrix')}finally{Module._load=old}
const modal=html.slice(html.indexOf('id="companyOverlay"'),html.indexOf('id="importOverlay"'));
test('annual editor includes section 09 matrix and section 10 billing/cash in correct order',()=>{
 assert.deepEqual([...modal.matchAll(/data-circular-number="(\d\d)"/g)].map(x=>x[1]),Array.from({length:11},(_,i)=>String(i).padStart(2,'0')));
 const m=modal.slice(modal.indexOf('data-circular-number="09"'),modal.indexOf('data-circular-number="10"'));
 const b=modal.slice(modal.indexOf('data-circular-number="10"'),modal.indexOf('id="companyYearAttachmentsSection"'));
 for(const id of ['matrixLoadExample','matrixAddProgram','matrixAddRow','companyProgramMatrixTable','companyProgramMatrixNote'])assert.ok(m.includes(`id="${id}"`),id);
 for(const id of ['billingPackageRows','cashPackageRows','addBillingPackage','addCashPackage'])assert.ok(b.includes(`id="${id}"`),id);
 assert.ok(!m.includes('id="billingPackageRows"'));assert.ok(!b.includes('id="annualHospitalProgramRows"'));
});
test('matrix data validated and normalized: statuses, quantities, bounds and lengths',()=>{
 const input={programs:[{name:'Program 1',price:2100},{name:'Program 2',price:5700}],rows:[{no:'1',en:'Physical Examination',th:'ตรวจร่างกาย',checks:['yes','na']}],note:'เงื่อนไข'};
 const data=matrix.normalizeProgramMatrix(input);
 assert.deepEqual(data.rows[0].checks,['yes','na']);assert.equal(data.programs[1].price,5700);
 assert.equal(matrix.normalizeProgramMatrix({programs:[{name:'Test'}],rows:[{checks:['not valid']}]}).rows[0].checks[0],'blank');
 assert.throws(()=>matrix.normalizeProgramMatrix({programs:[],rows:{}}));
 assert.throws(()=>matrix.normalizeProgramMatrix({programs:Array(11).fill({}),rows:[]}));
 assert.throws(()=>matrix.normalizeProgramMatrix({programs:[{}],rows:Array(201).fill({})}));
});
test('32-row example is present and PDF matrix spans additional A4 pages without clipping footer',()=>{
 assert.match(js,/const COMPANY_MATRIX_SAMPLE_V76399=/);
 assert.match(js,/Mammogram Digital & US Breast/);
 let pages=[];const operations=[];
 const pdf={getPageCount:()=>pages.length,addPage:(size)=>{const p={drawText:(s)=>operations.push(String(s)),drawRectangle:()=>{},drawLine:()=>{},drawImage:()=>{}};assert.deepEqual(size,[595.28,841.89]);pages.push(p);return p}};
 const font={widthOfTextAtSize:(s,pt)=>Array.from(s).length*pt*.53};
 const rows=Array.from({length:110},(_,i)=>({no:i+1,en:`Checkup ${i+1}`,th:'ตรวจร่างกายทั่วไป',checks:['yes','na','blank','yes','na']}));
 const made=matrix.drawProgramMatrixPages(pdf,font,{name:'บริษัททดสอบ',year:2569},{programs:Array.from({length:5},(_,i)=>({name:`Program ${i+1}`,price:i*500+2000})),rows});
 assert.ok(made>=3,'should paginate 110 lines');assert.equal(made,pages.length);assert.ok(operations.some(s=>s.includes('Program 1')));assert.ok(operations.some(s=>s.includes('110')));
});
test('only a single canonical circular JSON stores matrix; matrix is printed before attachments',()=>{
 assert.match(js,/programMatrix:readMatrixV76399\(\)/);
 assert.match(js,/programMatrix:raw\.programMatrix\|\|/);
 assert.match(js,/renderMatrixV76399\(data\.programMatrix\|\|/);
 assert.match(js,/await saveCompanyForPrimaryV76395\(\)/);
 assert.match(pdfSource,/drawProgramMatrixPages\(pdf,font,company,d\.programMatrix/);
 assert.match(server,/buildCorporateCircularPdf\(co,defaultCircular\(co,memo\|\|\{\}\)\)/);
 assert.match(server,/mergeCircularAndAttachments\(main,\[\.\.\.legacy\.rows,\.\.\.added\.rows\]\)/);
});
test('release metadata and Update Center/Windows installer remain present',()=>{
 assert.match(require('./package.json').version,/^7\.(?:63\.99|64\.\d+)$/);assert.match(server,/RELEASE_NAME = 'v7\.(?:63\.99|64\.\d+)-production'/);
 for(const file of ['INSTALL-REPAIR.bat','tools/app-update-helper.js','tools/start-production-installer.vbs','templates/corporate-circular-template.pdf'])assert.ok(fs.existsSync(`${root}/${file}`),file);
});
