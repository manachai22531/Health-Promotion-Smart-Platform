'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Module=require('node:module');
const root=__dirname;
const html=fs.readFileSync(path.join(root,'app.html'),'utf8');
const js=fs.readFileSync(path.join(root,'assets/app.js'),'utf8');
const css=fs.readFileSync(path.join(root,'assets/style.css'),'utf8');
const server=fs.readFileSync(path.join(root,'server.js'),'utf8');
const sections=fs.readFileSync(path.join(root,'corporate-circular-sections.js'),'utf8');
const originalLoad=Module._load;
let pdfTools,circularRenderer;
try{
  Module._load=function(request,parent,isMain){
    if(request==='pdf-lib')return {PDFDocument:{},rgb:(...v)=>({rgb:v})};
    if(request==='@pdf-lib/fontkit')return {};
    return originalLoad.call(this,request,parent,isMain);
  };
  pdfTools=require('./corporate-circular-pdf.js');
  circularRenderer=require('./corporate-circular-sections.js');
}finally{Module._load=originalLoad}
const editor=html.slice(html.indexOf('<div aria-hidden="true" class="overlay" id="companyOverlay">'),html.indexOf('id="companyYearAttachmentsSection"'));
const heading=(id)=>editor.match(new RegExp('data-circular-number="'+id+'"[\\s\\S]{0,200}?<span class="company-year-v76394-number">([0-9]{2})'))?.[1];
const menu=(id)=>editor.match(new RegExp('data-company-section="'+id+'"><span>([0-9]{2})'))?.[1];
const sample={
  companyNameEn:'Example Co Ltd',taxId:'0123456789123',address:'กรุงเทพมหานคร',payorCode:'PAY001',payorPlan:'PLAN001',coordinator:'ชื่อเดิม - 022222222',employeeCount:'256',
  coordinators:[{name:'สมชาย ใจดี',phone:'02-123-4567',email:'person@example.com'}],
  additionalCompanies:[{name:'บริษัทในเครือ 1',nameEn:'Affiliate One',taxId:'0987654321000',code:'OLD-CODE',employeeCount:'250',address:'ถนนตัวอย่าง',payorCode:'PAY-SUB',payorPlan:'PLAN-SUB'}],
  subject:'เอกสารทดสอบ',screeningPeriod:'พฤศจิกายน',hospitalPrograms:[],familyPrograms:[],programMatrix:{programs:[],rows:[],note:''}
};
function drawMock(input=sample){
  const text=[],rects=[];
  const pdf={pages:[],addPage(){const page={drawText(v,opt){text.push({value:v,...opt,page:pdf.pages.length+1})},drawRectangle(o){rects.push(o)},drawLine(){},drawImage(){}};pdf.pages.push(page);return page}};
  const font={widthOfTextAtSize:(s,size)=>Array.from(s).length*size*0.51};
  circularRenderer.appendAnnualCircularSections(pdf,font,{name:'บริษัทแม่',year:2569,code:'INTERNAL-CODE'},input,{});
  return {text,rects,pages:pdf.pages};
}
test('UI: main company restores tax ID before address and hides the internal year and company code',()=>{
  assert.ok(editor.indexOf('id="letter_taxId"')<editor.indexOf('id="letter_address"'));
  assert.ok(editor.includes('class="annual-v76419-internal-fields"'));
  assert.match(css,/\.annual-v76419-internal-fields\{display:none!important\}/);
  assert.equal((editor.match(/id="letter_employeeCount"/g)||[]).length,1);
});
test('UI: affiliate title and controls use บริษัทในเครือ and do not show employee fields',()=>{
  assert.match(editor,/data-circular-subsection="02"/);
  assert.match(js,/ลบบริษัทในเครือ/);
  assert.match(js,/data-subsidiary-field="employeeCount" type="hidden"/);
  assert.match(js,/data-subsidiary-field="code" type="hidden"/);
});
test('UI: coordinator follows affiliate, one-row name/phone/email then separate employee count',()=>{
  const positions=['data-circular-subsection="02"','data-circular-subsection="03"','data-circular-subsection="04"'].map(x=>editor.indexOf(x));
  assert.ok(positions.every(x=>x>0)&&positions[0]<positions[1]&&positions[1]<positions[2]);
  assert.match(js,/data-coordinator-name/);assert.match(js,/data-coordinator-phone/);assert.match(js,/data-coordinator-email/);
  assert.match(css,/\.annual-v76419-coordinator-row\{display:grid!important;grid-template-columns:minmax\(0,1fr\) minmax\(0,\.85fr\) minmax\(0,1\.2fr\) auto!important/);
});
test('UI: headers/nav preserve API section IDs but display contiguous 01–13, plus existing cover 00',()=>{
  assert.match(editor,/data-company-subsection="02"><span>02<\/span>/);
  assert.match(editor,/data-company-subsection="03"><span>03<\/span>/);
  assert.match(editor,/data-company-subsection="04"><span>04<\/span>/);
  for(let n=2;n<=10;n++){const id=String(n).padStart(2,'0'),shown=String(n+3).padStart(2,'0');assert.equal(menu(id),shown,`nav ${id}`)}
  for(let n=2;n<=10;n++){const id=String(n).padStart(2,'0'),shown=String(n+3).padStart(2,'0');assert.equal(heading(id),shown,`heading ${id}`)}
});
test('API: section 01 persists coordinators separately without losing existing memo fields',()=>{
  assert.match(server,/'01':\['companyNameEn','taxId','address','coordinator','coordinators','employeeCount'/);
  assert.match(js,/coordinators:coordinatorRows/);
  assert.match(js,/raw\.coordinators\.map\(row=>\(\{name:/);
  assert.match(js,/addCircularCoordinatorV76400\(c\.name\|\|'',c\.phone\|\|'',c\.email\|\|''\)/);
});
test('API: normalizer keeps legacy company code and employee count metadata without showing them in PDF',()=>{
  const norm=pdfTools.normalizeCircular(sample);
  assert.equal(norm.additionalCompanies[0].code,'OLD-CODE');
  assert.equal(norm.additionalCompanies[0].employeeCount,'250');
  assert.equal(norm.employeeCount,'256');
  assert.deepEqual(norm.coordinators,[{name:'สมชาย ใจดี',phone:'02-123-4567',email:'person@example.com'}]);
  assert.equal(pdfTools.normalizeCircular({...sample,coordinators:undefined}).coordinators.length,1);
  assert.throws(()=>pdfTools.normalizeCircular({...sample,coordinators:'bad'}));
});
test('PDF: inline code/plan follow Thai/English names at same y coordinate',()=>{
  const {text}=drawMock();
  const find=(value)=>text.find(t=>t.value===value);
  assert.equal(find('ชื่อบริษัท (ภาษาไทย)').y,find('Payor Code').y);
  assert.equal(find('ชื่อบริษัท (ภาษาอังกฤษ)').y,find('Payor Plan').y);
  assert.ok(text.some(t=>t.value==='บริษัทแม่'&&t.y===find('PAY001').y)); // same data row
  assert.equal(find('PLAN001').y,find('Example Co Ltd').y);
});
test('PDF: affiliate has tax ID then address; coordinator and employee count are separate numbered sections',()=>{
  const {text}=drawMock();
  const values=text.map(x=>x.value),sections=values.filter(x=>/^0[1-9]  |^1[01]  /.test(x));
  assert.ok(sections.indexOf('01  ข้อมูลบริษัท')<sections.indexOf('02  บริษัทในเครือ'));
  assert.ok(sections.indexOf('02  บริษัทในเครือ')<sections.indexOf('03  ผู้ประสานงานบริษัท'));
  assert.ok(sections.indexOf('03  ผู้ประสานงานบริษัท')<sections.indexOf('04  จำนวนพนักงาน'));
  assert.equal(values.filter(x=>x==='จำนวนพนักงานทั้งหมด').length,1);
  assert.ok(values.indexOf('777646854')<values.indexOf('ถนนตัวอย่าง'));
  assert.ok(values.includes('person@example.com')||values.some(x=>x.includes('person@example.com')));
});
test('PDF: do not print internal company year or code, affiliate code, or affiliate employee count',()=>{
  const {text}=drawMock();const content=text.map(x=>x.value).join(' | ');
  for(const no of ['ปีตรวจสุขภาพ','รหัสบริษัท','รหัสบริษัทลูก','INTERNAL-CODE','OLD-CODE','250'])assert.doesNotMatch(content,new RegExp(no));
});
test('PDF: compact section header and row heights',()=>{
  assert.match(sections,/const h=20;rect\(LEFT,at,contentWidth,h,pale\)/);
  assert.match(sections,/Math\.max\(20,8\+rowLines\*10\.8\)/);
});
test('PDF: document sections no longer use old 09/10 appendix labels',()=>{
  const build=fs.readFileSync('corporate-circular-pdf.js','utf8');
  const matrix=fs.readFileSync('company-program-matrix.js','utf8');
  assert.match(build,/12 ตารางโปรแกรมตรวจสุขภาพ/);
  assert.match(build,/13 รายการตรวจเพิ่มเติม/);
  assert.match(matrix,/12 ตารางโปรแกรมตรวจสุขภาพ/);
});
