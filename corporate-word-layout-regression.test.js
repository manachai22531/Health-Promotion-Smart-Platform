'use strict';
const assert=require('node:assert/strict');
const test=require('node:test');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=__dirname;

function load(rel,overrides={}){
  const code=fs.readFileSync(path.join(root,rel),'utf8');
  const mod={exports:{}};
  const request=(id)=>{
    if(id in overrides)return overrides[id];
    if(id==='pdf-lib')return {rgb:(r,g,b)=>({r,g,b}),PDFDocument:{create:async()=>({})}};
    if(id==='@pdf-lib/fontkit')return {};
    if(id==='./company-program-matrix')return {normalizeProgramMatrix:()=>({programs:[],rows:[],note:''}),drawProgramMatrixPages:()=>0};
    if(id==='./corporate-circular-sections')return {appendAnnualCircularSections:()=>1};
    return require(id);
  };
  vm.runInNewContext(code,{module:mod,exports:mod.exports,require:request,process,Buffer,Intl,console,__dirname:root},{filename:rel});
  return mod.exports;
}
function dummyFont(){return {widthOfTextAtSize:(s,z)=>[...String(s)].reduce((x,c)=>x+(c.codePointAt(0)>0x0E00&&c.codePointAt(0)<0x0E7F?0.6:0.51)*z,0)};}
function runGenerator(company={},data={}){
  const pages=[];
  const doc={addPage:()=>{
    const ops=[];pages.push(ops);
    return {drawText:(v,o)=>ops.push({type:'text',value:v,...o}),drawRectangle:(o)=>ops.push({type:'rect',...o}),drawLine:(o)=>ops.push({type:'line',...o})};
  }};
  const {appendAnnualCircularSections}=load('corporate-circular-sections.js');
  const pageCount=appendAnnualCircularSections(doc,dummyFont(),company,data);
  assert.equal(pageCount,pages.length);
  for(const ops of pages){
    assert(ops.some(o=>o.type==='text'&&o.value==='เอกสารเวียนตรวจสุขภาพประจำปี'));
    for(const box of ops.filter(o=>o.type==='rect')){
      assert(box.x>=31.9&&box.x+box.width<=563.4,'rect fits page width');
      assert(box.y>=36.9&&box.y+box.height<=841.95,'rect fits page height');
    }
  }
  return {pages,ops:pages.flat()};
}
const vals=[
  {name:'บริษัททดสอบ 001 จำกัด',companyNameEn:'Example Company 001 Ltd.',payorCode:'2342542',payorPlan:'234234234',taxId:'2356256',address:'ที่อยู่สำนักงานใหญ่'},
  {name:'บริษัทในเครือ 1 จำกัด',nameEn:'Affiliate One Ltd.',payorCode:'684654',payorPlan:'6846541',taxId:'777646854',address:'ที่อยู่บริษัทในเครือ'}
];
const getText=(ops)=>ops.filter(x=>x.type==='text');

test('Word letterhead has right-hand date and letter number; no redundant report banner',()=>{
  const {ops}=runGenerator({name:vals[0].name,year:'2569',code:'TC001'},{issueDate:'2026-01-01',documentNo:'35468436541',subject:'การตรวจสุขภาพประจำปี'});
  const t=getText(ops);assert(t.some(o=>o.value==='01/01/2569'));
  assert(t.some(o=>o.value==='35468436541'));
  assert(!t.some(o=>String(o.value).includes('สรุปรายงานบริษัท')));
  assert(!t.some(o=>o.value.includes('TC001')));
});

test('company/subsidiary rows use inline Payor split, tax ID and address share identical value x',()=>{
  const {ops}=runGenerator({name:vals[0].name},{...vals[0],additionalCompanies:[vals[1]]});
  const rectangles=ops.filter(o=>o.type==='rect');
  const splitRows=rectangles.filter(o=>Math.abs(o.width-257.3)<.2);
  assert.equal(splitRows.length,5,'4 paired name rows plus one empty coordinator row use split columns');
  const t=getText(ops),at=(v)=>t.find(o=>o.value===v);
  const company=t.find(o=>o.value===vals[0].name&&o.y<750);const tax=at('2356256');const address=at('ที่อยู่สำนักงานใหญ่');
  assert(company&&tax&&address);
  assert.equal(company.x,tax.x);
  assert.equal(tax.x,address.x);
  assert(t.some(o=>o.value==='Payor Code')&&t.some(o=>o.value==='Payor Plan'));
  assert(t.some(o=>o.value==='684654')&&t.some(o=>o.value==='6846541'));
});

test('multiple coordinators remain 3 physical value columns with exact email',()=>{
 const {ops}=runGenerator({name:'ABC'},{coordinators:[{name:'สมชาย ใจดี',phone:'02-123-4567',email:'somchai@example.com'},{name:'สมหญิง ใจดี',phone:'02-999-9999',email:'somying@example.com'}],employeeCount:'256'});
 const t=getText(ops);const a=(v)=>t.find(o=>o.value===v);
 assert(a('สมชาย ใจดี')&&a('somchai@example.com')&&a('สมหญิง ใจดี')&&a('somying@example.com'));
 assert(a('สมชาย ใจดี').y===a('02-123-4567').y);
 assert(a('02-123-4567').y===a('somchai@example.com').y);
 assert(a('จำนวนพนักงานทั้งหมด').y<a('ผู้ประสานงาน').y);
});

test('compact continuous Word table avoids section blue banners and old PDF columns header',()=>{
 const {ops}=runGenerator({name:'Company'},{additionalCompanies:[vals[1]],hospitalPrograms:[{name:'A',price:'200',code:'P-01'}],familyPrograms:[{name:'B',price:'400',code:'F-02'}]});
 assert.equal(ops.filter(o=>o.type==='rect'&&o.color&&o.color.b!==1).length,0);
 assert(!getText(ops).some(o=>o.value==='หัวข้อ / รายการ'||o.value==='00  ข้อมูลหัวหนังสือ'));
 assert(getText(ops).some(o=>o.value==='P-01'));
 assert(getText(ops).some(o=>o.value==='F-02'));
});

test('long text and many subsidiaries paginate with no overflow',()=>{
 const co={name:'A'};
 const data={additionalCompanies:Array.from({length:20},(_,i)=>({...vals[1],name:'บริษัท'+i+' ('+'x'.repeat(80)+')',address:'ข้อความยาวมาก '.repeat(40)})),medicalStaff:'รายละเอียด '.repeat(100),reporting:'รายงาน '.repeat(400)};
 const {pages}=runGenerator(co,data);
 assert(pages.length>3);
 for(const ops of pages){assert(ops.some(o=>o.type==='text'&&o.value==='เอกสารเวียนตรวจสุขภาพประจำปี'));}
});

test('program rows have Name + Price + Code without extra detail-page duplication',()=>{
 const {ops}=runGenerator({name:'A'},{hospitalPrograms:[{name:'โปรแกรมเอ',price:'1,000',code:'AAA'},{name:'โปรแกรมบี',price:'2,000',code:'BBB'}],familyPrograms:[{name:'โปรแกรมซี',unitPrice:350,code:'CCC'}]});
 const t=getText(ops);assert(t.some(o=>o.value==='โปรแกรมเอ')&&t.some(o=>o.value==='1,000')&&t.some(o=>o.value==='AAA'));
 assert(t.some(o=>o.value==='350')&&t.some(o=>o.value==='CCC'));
});

test('typical Word sample with 2 affiliates, 2 contacts and 7 package rows fits A4',()=>{
 const additionalCompanies=[{name:'A1',nameEn:'Affiliate 1',payorCode:'P1',payorPlan:'PLAN1',taxId:'123456',address:'Address 1'},{name:'A2',nameEn:'Affiliate 2',payorCode:'P2',payorPlan:'PLAN2',taxId:'654321',address:'Address 2'}];
 const programs=Array.from({length:3},(_,i)=>({name:'Package '+i,price:'1200',code:'P'+i}));
 const familyPrograms=Array.from({length:4},(_,i)=>({name:'Family '+i,price:'1500',code:'F'+i}));
 const {pages}=runGenerator({name:'บริษัททดสอบ 001 จำกัด'},{additionalCompanies,coordinators:[{name:'Somchai',phone:'081234',email:'a@example.com'},{name:'Somying',phone:'085678',email:'b@example.com'}],hospitalPrograms:programs,familyPrograms,employeeCount:'256'});
 assert.equal(pages.length,1);
});

test('normalization retains structured coordinators and PDF-only optional content',()=>{
 const {normalizeCircular}=load('corporate-circular-pdf.js');
 const a=normalizeCircular({coordinators:[{name:'สมชาย',phone:'0123',email:'a@b.com'}],medicalDetails:'more',financeDetails:'cash',receivableDetails:'terms'});
 assert.equal(a.coordinators[0].email,'a@b.com');
 assert.equal(a.medicalDetails,'more');
 assert.equal(a.financeDetails,'cash');
 assert.equal(a.receivableDetails,'terms');
});

test('legacy coordinator string is normalized for old stored records',()=>{
 const {normalizeCircular}=load('corporate-circular-pdf.js');
 const a=normalizeCircular({coordinator:'สมชาย - 02-1234\nสมหญิง - 02-5678'});
 assert.equal(a.coordinators.length,2);
 assert.equal(a.coordinators[1].phone,'02-5678');
});

test('program detail page is skipped unless there is a real program matrix',()=>{
 const text=fs.readFileSync(path.join(root,'corporate-circular-pdf.js'),'utf8');
 assert(!text.includes('if(!hasMatrix && programRows.length)'));
 assert(text.includes('if(hasMatrix){'));
});
