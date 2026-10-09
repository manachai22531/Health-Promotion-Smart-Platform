'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const Module=require('node:module');
const oldLoad=Module._load;
const pages=[];
const newPage=()=>({texts:[],getHeight:()=>841.92,drawText(v){this.texts.push(String(v))},drawRectangle(){},drawLine(){}});
const doc={getPages(){return pages},registerFontkit(){},async copyPages(){return [newPage()]},addPage(p){const page=Array.isArray(p)||!p?newPage():p;pages.push(page);return page},async embedFont(){return {widthOfTextAtSize:s=>[...s].length*4}},async embedPng(){return {}},async save(){return Uint8Array.of(37,80,68,70)}};
let corporate;
try {
  Module._load=function(name,...args){
    if(name==='pdf-lib')return {PDFDocument:{load:async()=>({}),create:async()=>doc},rgb:(...values)=>values};
    if(name==='@pdf-lib/fontkit')return {};
    return oldLoad.call(this,name,...args);
  };
  corporate=require('./corporate-circular-pdf');
} finally {Module._load=oldLoad;}
const mockFont='/usr/share/fonts/truetype/noto/NotoSansThai-Regular.ttf';
const hasThaiFont=fs.existsSync(mockFont);
test('company subsidiaries are numbered 1.1, 1.2, 1.3 inside row 1, not as generic appendix',async t=>{
  if(!hasThaiFont)return t.skip('No Thai font on this test host');
  pages.length=0;
  const subsidiaries=Array.from({length:3},(_,i)=>({name:`บริษัทลูก ${i+1}`,code:`CHILD-${i+1}`,contact:`ผู้ประสานงาน ${i+1}`}));
  const bytes=await corporate.buildCorporateCircularPdf({name:'บริษัทแม่',year:2569},{additionalCompanies:subsidiaries},{fontPath:mockFont});
  assert.ok(bytes.length);
  assert.deepEqual([0,1,2].map(corporate.subsidiaryNumber),['1.1','1.2','1.3']);
  for(const label of ['1.1','1.2','1.3'])assert.ok(pages[0].texts.includes(label),`${label} should appear on page 1, within section 1`);
  assert.ok(pages.slice(1).some(p=>p.texts.some(s=>s.startsWith('1 ข้อมูลบริษัท (ต่อ)'))),'Detailed subsidiary records should follow row 1');
  assert.ok(pages.slice(1).some(p=>p.texts.some(s=>s.startsWith('1.3  บริษัทลูก 3'))));
  assert.ok(!pages.some(p=>p.texts.some(s=>s.startsWith('บริษัทในเครือ'))),'Old generic appendix must not be used');
});
test('up to 20 subsidiaries remain in correct 1.x sequence on continuation pages',async t=>{
  if(!hasThaiFont)return t.skip('No Thai font on this test host');
  pages.length=0;
  const subsidiaries=Array.from({length:20},(_,i)=>({name:`บริษัทลูก ${i+1}`,address:`ที่อยู่ ${i+1}`}));
  await corporate.buildCorporateCircularPdf({name:'บริษัทแม่',year:2569},{additionalCompanies:subsidiaries},{fontPath:mockFont});
  const text=pages.flatMap(p=>p.texts);
  for(let i=0;i<20;i++)assert.ok(text.some(s=>s===`1.${i+1}  บริษัทลูก ${i+1}`),`Missing subsidiary 1.${i+1}`);
});
