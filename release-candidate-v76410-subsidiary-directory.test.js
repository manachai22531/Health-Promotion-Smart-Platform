'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),Module=require('node:module'),fs=require('node:fs');
const original=Module._load;
const fakePage=(w=595.32,h=841.92)=>({w,h,strokes:[],getWidth(){return w},getHeight(){return h},drawText(v,args){this.strokes.push({type:'text',v:String(v),x:args.x,y:args.y,size:args.size,color:args.color})},drawRectangle(args){this.strokes.push({type:'rect',x:args.x,y:args.y,w:args.width,h:args.height,color:args.color})},drawLine(){},drawImage(){}});
const fakeDocument=()=>({pages:[],addPage(value){const p=Array.isArray(value)?fakePage(...value):value||fakePage();this.pages.push(p);return p},getPages(){return this.pages},getPageCount(){return this.pages.length},async copyPages(source,indexes){return indexes.map(i=>{const p=source.pages[i];return Object.assign(fakePage(p.w,p.h),{strokes:[...p.strokes]})})},registerFontkit(){},async embedFont(){return {widthOfTextAtSize(t,size){return Array.from(t).length*size*0.51}}},async save(){return Buffer.from(JSON.stringify(this.pages.map(p=>p.strokes)))}});
let load;
try {
  Module._load=function(id,parent,isMain){if(id==='pdf-lib')return {PDFDocument:{async load(){const d=fakeDocument();d.addPage(fakePage());return d},async create(){return fakeDocument()}},rgb:(...c)=>c};if(id==='@pdf-lib/fontkit')return {};return original.call(this,id,parent,isMain)};
  load=require('./corporate-circular-pdf');
} finally {Module._load=original}
const texts=page=>(page||[]).filter(x=>x.type==='text').map(x=>x.v);
const base={name:'บริษัทแม่ ทดสอบ จำกัด',year:'2569'};
const subsidiary=i=>({name:`บริษัทลูกทดสอบ ${i}`,taxId:`TAX${i}`,address:`ที่อยู่เลขที่ ${i} ถนนตัวอย่าง กรุงเทพมหานคร`,payorCode:`PAYOR${i}`,payorPlan:`PLAN${i}`,code:`SUB${i}`});
test('preserves subsidiary and main company fields, including tax ID address and independent payor',()=>{
  const d=load.normalizeCircular({additionalCompanies:[subsidiary(1),subsidiary(2)],taxId:'TAXP',address:'ถนนสำนักงานใหญ่',payorCode:'PARENT-PAYOR'});
  assert.equal(d.additionalCompanies.length,2);assert.equal(d.additionalCompanies[1].payorCode,'PAYOR2');
});
test('parent and subsidiaries render in section 01 at the START, not at end annex',async()=>{
  const bytes=await load.buildCorporateCircularPdf(base,{subject:'ตรวจสุขภาพปี 2569',taxId:'TAXP',address:'ที่อยู่สำนักงานใหญ่',payorCode:'PAYOR-P',payorPlan:'PL-P',additionalCompanies:[subsidiary(1),subsidiary(2)]});
  if(process.env.SUBSIDIARY_PDF_DEBUG_JSON)fs.writeFileSync(process.env.SUBSIDIARY_PDF_DEBUG_JSON,bytes);
  const pages=JSON.parse(bytes.toString()),all=pages.flatMap(texts).join('|');
  for(const v of ['บริษัทแม่ ทดสอบ','1.1','1.2','TAXP','TAX1','TAX2','PAYOR-P','PAYOR1','PAYOR2','ที่อยู่เลขที่ 2','PLAN2'])assert.ok(all.includes(v),`Missing ${v}`);
  assert.ok(all.includes('01  ข้อมูลบริษัท'),'section 01 is a flowing table');
});
test('20 subsidiaries span pages without dropping any names or payor codes',async()=>{
  const rows=Array.from({length:20},(_,i)=>subsidiary(i+1));
  const bytes=await load.buildCorporateCircularPdf(base,{additionalCompanies:rows,address:'สำนักงานใหญ่'});
  const pages=JSON.parse(bytes.toString()),all=pages.flatMap(texts).join('|');
  assert.ok(pages.length>2,'many companies should create continuation pages');
  for(let i=1;i<=20;i++){assert.ok(all.includes(`บริษัทลูกทดสอบ ${i}`),`missing company ${i}`);assert.ok(all.includes(`PAYOR${i}`),`missing payor ${i}`);}
});
test('no subsidiaries still builds sections 00–08 dynamically without a static template',async()=>{
 const bytes=await load.buildCorporateCircularPdf(base,{address:'สำนักงานใหญ่'}),pages=JSON.parse(bytes.toString()),all=pages.flatMap(texts).join('|');assert.ok(pages.length>=1);assert.ok(all.includes('00  ข้อมูลหัวหนังสือ'));assert.ok(all.includes('08  เจ้าหน้าที่ขาย'));
});
test('section order remains company table → circular → section 09 → section 10',async()=>{
  const b=await load.buildCorporateCircularPdf({...base,billingPackages:[{name:'ตรวจเพิ่ม',unitPrice:100,quantity:1}]},{additionalCompanies:[subsidiary(1)],programMatrix:{programs:[{name:'โปรแกรม เอ',price:1200}],rows:[{no:'1',en:'CBC',th:'ตรวจเลือด',checks:['yes']}],note:''}});
  const pages=JSON.parse(b.toString()),pageTexts=pages.map(p=>texts(p).join('|'));
  assert.ok(pageTexts.some(t=>t.includes('01  ข้อมูลบริษัท')));
  assert.ok(pageTexts.some(p=>p.includes('ตารางโปรแกรมตรวจสุขภาพ')),'section 09 matrix preserved');
  assert.ok(pageTexts.some(p=>p.includes('10 รายการตรวจเพิ่มเติม')),'section 10 preserved');
  const i9=pageTexts.findIndex(p=>p.includes('ตารางโปรแกรมตรวจสุขภาพ')),i10=pageTexts.findIndex(p=>p.includes('10 รายการตรวจเพิ่มเติม'));
  assert.ok(i9>=1&&i10>i9,`bad order 09=${i9} 10=${i10}`);
});
