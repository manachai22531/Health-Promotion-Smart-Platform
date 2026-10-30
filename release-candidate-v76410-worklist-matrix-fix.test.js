'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=__dirname;
const html=fs.readFileSync(path.join(root,'app.html'),'utf8');
const js=fs.readFileSync(path.join(root,'assets/app.js'),'utf8');
const css=fs.readFileSync(path.join(root,'assets/style.css'),'utf8');
const server=fs.readFileSync(path.join(root,'server.js'),'utf8');
const pdfSource=fs.readFileSync(path.join(root,'corporate-circular-pdf.js'),'utf8');
const matrixSource=fs.readFileSync(path.join(root,'company-program-matrix.js'),'utf8');
function mockModule(source,requireImpl){const module={exports:{}};vm.runInNewContext(source,{require:requireImpl,module,exports:module.exports,__dirname:root,process,Buffer,Intl,console},{filename:'mock-source.js'});return module.exports;}
const fakeRgb=()=>({});
const matrix=mockModule(matrixSource,(id)=>id==='pdf-lib'?{rgb:fakeRgb}:require(id));
const circular=mockModule(pdfSource,(id)=>id==='pdf-lib'?{PDFDocument:{},rgb:fakeRgb}:id==='@pdf-lib/fontkit'?{}:id==='./company-program-matrix'?matrix:id==='./corporate-circular-sections'?{appendAnnualCircularSections:()=>{}}:require(id));

test('worklist retains left rail and right table with final grid display override',()=>{
 assert.match(css,/#worklistView\.workspace-fullpage \.workflow-table-card\.worklist-new-layout\{\s*display:grid!important/);
 assert.match(html,/class="workflow-table-card worklist-new-layout"><aside class="worklist-confirmation-panel"/);
 assert.match(html,/class="worklist-today-panel"/);
 assert.match(css,/\.worklist-today-table\{min-width:1360px!important/);
});
test('company section 09 has a single save action bound at runtime',()=>{
 assert.doesNotMatch(html,/data-save-company-section="09"/);
 assert.match(js,/installAnnualSectionSavesV76400\(\)/);
 assert.match(js,/dataset\.saveAnnualSection/);
 assert.match(js,/bindMatrixV76399\(\);loadCircularFormV76393/);
});
test('company contacts display only in the shared multi-contact editor',()=>{
 assert.match(html,/<input id="letter_contactPerson" type="hidden"\/>/);
 assert.match(html,/<input id="letter_contactPhone" type="hidden"\/>/);
 assert.match(html,/id="circularCoordinatorRows"/);
 assert.match(js,/coordinator:coordinators\.join/);
 assert.match(js,/rows\.forEach\(c=>addCircularCoordinatorV76400/);
});
test('section 09 sends programMatrix only and persists separately',()=>{
 assert.match(server,/'09':\['programMatrix'\]/);
 assert.match(js,/additionalCompanies:readCircularSubsidiariesV76397\(\),programMatrix:readMatrixV76399\(\)/);
 assert.match(js,/renderMatrixV76399\(data\.programMatrix\|\|/);
 assert.match(js,/if\(\['01','02','06','08','10'\]\.includes\(number\)\)/);
});
test('circular normalizer retains saved matrix and legacy programs',()=>{
 const draft={programs:[{name:'Manager',price:2500}],rows:[{no:'1',en:'CBC',th:'ตรวจความสมบูรณ์ของเลือด',checks:['yes']}],note:'remark'};
 const out=circular.normalizeCircular({hospitalPrograms:[{name:'legacy'}],programMatrix:draft});
 assert.equal(out.programMatrix.programs[0].name,'Manager');
 assert.equal(out.programMatrix.rows[0].checks[0],'yes');
 assert.equal(out.hospitalPrograms[0].name,'legacy');
});
test('matrix drawer paginates 35 examination items and handles selection',()=>{
 const pages=[],ops=[];
 const fakePdf={getPageCount:()=>pages.length,addPage:()=>{const p={drawText:()=>{},drawRectangle:()=>{},drawLine:()=>{},drawImage:()=>{}};pages.push(p);return p}};
 const font={widthOfTextAtSize:(txt,size)=>String(txt).length*size*.55};
 const programs=Array.from({length:5},(_,i)=>({name:`Program ${i+1}`,price:1000+i}));
 const rows=Array.from({length:35},(_,i)=>({no:String(i+1),en:`Lab Test ${i+1}`,th:'ทดสอบ',checks:programs.map(()=>i%2?'yes':'na')}));
 const n=matrix.drawProgramMatrixPages(fakePdf,font,{name:'Hospital',year:'2569'},{programs,rows,note:''});
 assert.ok(n>=1);assert.equal(n,pages.length);
});
