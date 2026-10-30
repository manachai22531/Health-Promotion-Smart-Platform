'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const Module=require('node:module');const fs=require('node:fs');
const original=Module._load;
const fakePage=(w=595.32,h=841.92)=>({width:w,height:h,marks:[],drawText(str,config){this.marks.push({kind:'text',text:String(str),x:config.x,y:config.y})},drawRectangle(config){this.marks.push({kind:'rectangle',x:config.x,y:config.y,width:config.width,height:config.height})},drawLine(){},drawImage(){}});
const fakeDoc=()=>({pages:[],addPage(size){const p=Array.isArray(size)?fakePage(...size):size||fakePage();this.pages.push(p);return p},getPages(){return this.pages},getPageCount(){return this.pages.length},registerFontkit(){},async embedFont(){return {widthOfTextAtSize:(text,size)=>Array.from(String(text)).length*size*.53}},async embedPng(){return {width:80,height:65}},async save(){return Buffer.from(JSON.stringify(this.pages.map(p=>p.marks)))}});
let pdf;
try{Module._load=function(name,parent,isMain){if(name==='pdf-lib')return {PDFDocument:{create:async()=>fakeDoc(),load:async()=>{throw new Error('LEGACY TEMPLATE LOAD CALLED')}},rgb:(...value)=>value};if(name==='@pdf-lib/fontkit')return {};return original.call(this,name,parent,isMain)};pdf=require('./corporate-circular-pdf');}finally{Module._load=original}
const pagesOf=async(co,data)=>JSON.parse((await pdf.buildCorporateCircularPdf(co,data)).toString());
const pageText=page=>page.filter(m=>m.kind==='text').map(m=>m.text).join(' | ');
const allText=pages=>pages.map(pageText).join(' | ');
const co={name:'บริษัทแม่ทดสอบ จำกัด',code:'TEST',year:'2569'};
const sub=i=>({name:`บริษัทลูกทดสอบ ${i}`,nameEn:`Child ${i}`,taxId:`TAX_${i}`,address:`ที่อยู่บริษัทลูก ${i} สุขุมวิท กรุงเทพมหานคร`,code:`SUB_${i}`,payorCode:`PAYOR_${i}`,payorPlan:`PLAN_${i}`});
test('uses only flowing tables, with no static template copy or fixed-position source PDF',async()=>{
 const bytes=await pagesOf(co,{subject:'เอกสารเวียน',taxId:'PARENT_TAX'}),text=allText(bytes);
 assert.ok(bytes.length>=1);assert.ok(text.includes('ข้อมูลหัวหนังสือ'));assert.ok(text.includes('ข้อมูลบริษัท'));
 for(let i=0;i<=8;i++)assert.ok(text.includes(`${String(i).padStart(2,'0')}  `),`missing section ${i}`);
 assert.doesNotMatch(fs.readFileSync('corporate-circular-pdf.js','utf8'),/copyPages\(source|PDFDocument\.load\(fs\.readFileSync\(templatePath\)/);
});
test('a main company, two subsidiaries and payor codes are all in section 01 in original order',async()=>{
 const pages=await pagesOf(co,{additionalCompanies:[sub(1),sub(2)],taxId:'MAIN_TAX',payorCode:'MAIN_PAYOR',coordinator:'คุณหนึ่ง / 1234\nคุณสอง / 5678'}),text=allText(pages);
 for(const token of ['บริษัทแม่ทดสอบ','1.1','1.2','MAIN_TAX','MAIN_PAYOR','TAX_1','TAX_2','PAYOR_1','PAYOR_2','PLAN_2','คุณสอง'])assert.ok(text.includes(token),token);
 assert.ok(text.indexOf('ข้อมูลบริษัท')<text.indexOf('ระยะเวลาในการตรวจ'),'section 01 precedes section 02');
});
test('all 20 subsidiaries flow onto subsequent pages without truncation or page coordinate overflow',async()=>{
 const pages=await pagesOf(co,{additionalCompanies:Array.from({length:20},(_,i)=>sub(i+1))}),text=allText(pages);
 assert.ok(pages.length>3,'20 subsidiaries must flow across several pages');
 for(let i=1;i<=20;i++){assert.ok(text.includes(`PAYOR_${i}`),`payor ${i}`);assert.ok(text.includes(`SUB_${i}`),`code ${i}`);}
 for(const page of pages)for(const mark of page){if(mark.kind==='text')assert.ok(mark.y>=-0.1&&mark.y<=841.92,`overflow ${mark.text} y=${mark.y}`);}
});
test('very long narrative fields create additional rows instead of cutting text off',async()=>{
 const paragraph=('รายละเอียดงานตรวจสุขภาพบริษัทไทยโดยไม่ตัดข้อความ ').repeat(35)+'END_OF_DETAILS_2026';
 const pages=await pagesOf(co,{programConditions:paragraph,eligibility:paragraph}),text=allText(pages);
 assert.ok(pages.length>2);assert.ok(text.includes('END_OF_DETAILS_2026'));
 assert.ok(text.includes('เงื่อนไขโปรแกรมตรวจ'));assert.ok(text.includes('การแสดงสิทธิ์ / การเงิน'));
});
test('actual matrix 09 and additional 10 tables follow all 00–08 data; no blank template page',async()=>{
 const pages=await pagesOf({...co,billingPackages:[{name:'ตรวจเพิ่ม วางบิล',quantity:1,unitPrice:250}],cashPackages:[{name:'ตรวจเพิ่ม เงินสด',quantity:1,unitPrice:150}]},{programMatrix:{programs:[{name:'โปรแกรม A',price:1200}],rows:[{no:'1',en:'CBC',th:'ความสมบูรณ์เม็ดเลือด',checks:['yes']}],note:''},additionalCompanies:[sub(1)]});
 const texts=pages.map(pageText),i8=texts.findIndex(t=>t.includes('08  เจ้าหน้าที่ขาย')),i9=texts.findIndex(t=>t.includes('09 ตารางโปรแกรม')),i10=texts.findIndex(t=>t.includes('10 รายการตรวจเพิ่มเติม'));
 assert.ok(i8>=0&&i9>i8&&i10>i9,`wrong order ${i8} ${i9} ${i10}`);
 assert.ok(allText(pages).includes('CBC'));assert.ok(allText(pages).includes('ตรวจเพิ่ม วางบิล'));
});
test('backend uses same generator for preview/primary and keeps PDF attachment merge',()=>{
 const server=fs.readFileSync('server.js','utf8'),html=fs.readFileSync('app.html','utf8');
 assert.match(server,/\/api\/company-circulars\/:companyId\/preview[\s\S]*?buildCorporateCircularPdf/);
 assert.match(server,/\/api\/company-primary-pdfs\/:companyId'[\s\S]*?buildCorporateCircularPdf/);
 assert.match(server,/mergeCompanyAttachmentPdfsV76401/);
 assert.match(html,/ตัวอย่าง PDF สร้างเป็นตารางต่อเนื่อง/);
});
