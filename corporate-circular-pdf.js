'use strict';
// Corporate circular / annual company letter, laid out against the provided Vimut PDF template.
// The user-provided template remains unmodified in templates/corporate-circular-template.pdf.
const fs = require('node:fs');
const path = require('node:path');
const { PDFDocument, rgb } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');
const TEMPLATE = path.join(__dirname, 'templates', 'corporate-circular-template.pdf');

const TEXT_FIELDS = Object.freeze({
  issueDate: 35, documentNo: 100, companyNameEn: 180, taxId: 45,
  address: 800, coordinator: 180, employeeCount: 30, payorCode: 100,
  payorPlan: 150, screeningPeriod: 300, medicalStaff: 250,
  eligibility: 2500, reporting: 2500, receivables: 2500,
  salesContact: 350, signatory: 180, appendixDetails: 3500, subject: 250, recipient: 700
});
function clean(value, max=400) { return String(value == null ? '' : value).replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0,max); }
function normalizeCircular(input={}) {
  if(!input || typeof input !== 'object' || Array.isArray(input))throw new Error('รูปแบบหนังสือเวียนไม่ถูกต้อง');
  const o={};
  for (const [key,max] of Object.entries(TEXT_FIELDS)) o[key]=clean(input[key],max);
  o.listenResults = input.listenResults === true;
  o.mealCoupon = input.mealCoupon === true;
  o.walkIn = input.walkIn !== false;
  for(const key of ['hospitalPrograms','familyPrograms']) {
    if(input[key] != null && !Array.isArray(input[key]))throw new Error(`รายการ ${key} ต้องเป็นตาราง`);
    if((input[key]||[]).length > 100)throw new Error('จำนวนโปรแกรมตรวจเกิน 100 รายการ');
    o[key]=(input[key]||[]).map(p=>{
      const quantity=Math.min(999,Math.max(1,Math.round(Number(p?.quantity)||1)));
      const unitPrice=Number(p?.unitPrice);
      const extra=Number.isFinite(unitPrice)&&unitPrice>=0?{unitPrice:Math.min(unitPrice,999999999)}:{};
      return {name:clean(p?.name,260),price:clean(p?.price,45),code:clean(p?.code,90),quantity,...extra};
    }).filter(p=>p.name||p.price||p.code);
  }
  if(input.additionalCompanies != null && !Array.isArray(input.additionalCompanies))throw new Error('ข้อมูลบริษัทลูกต้องเป็นรายการ');
  if((input.additionalCompanies||[]).length>20)throw new Error('ข้อมูลบริษัทลูกเกิน 20 บริษัท');
  const subsidiaryFields={name:150,nameEn:150,taxId:50,code:50,address:600,contact:150,phone:60,employeeCount:30,payorCode:100,payorPlan:100};
  o.additionalCompanies=(input.additionalCompanies||[]).map(row=>Object.fromEntries(Object.entries(subsidiaryFields).map(([key,max])=>[key,clean(row?.[key],max)]))).filter(row=>row.name);
  return o;
}
function defaultCircular(company={}, saved={}) {
  const start=clean(company.checkupStartDate,30),end=clean(company.checkupEndDate,30);
  return normalizeCircular({
    screeningPeriod:[start,end].filter(Boolean).join(' ถึง '),
    reporting:company.reportConditions||'',
    salesContact:[company.salesName,company.salesPhone].filter(Boolean).join(' / '),
    ...saved
  });
}
function fontFile() {
  const windir=process.env.WINDIR || 'C:\\Windows';
  return [process.env.CORPORATE_REPORT_THAI_FONT,
    path.join(windir,'Fonts','tahoma.ttf'),
    path.join(windir,'Fonts','THSarabunNew.ttf'),
    '/usr/share/fonts/truetype/noto/NotoSansThai-Regular.ttf',
    '/usr/share/fonts/truetype/noto/NotoLoopedThai-Regular.ttf'
  ].find(file=>file && fs.existsSync(file));
}
function splitByWidth(text, font, size, maxWidth) {
  const lines=[];
  const seg=typeof Intl.Segmenter==='function' ? new Intl.Segmenter('th',{granularity:'grapheme'}) : null;
  for(const para of String(text||'').split('\n')) {
    if(!para) { lines.push(''); continue; }
    const chars=seg ? [...seg.segment(para)].map(x=>x.segment) : Array.from(para);
    let line='';
    for(const char of chars) {
      const next=line+char;
      if(font.widthOfTextAtSize(next,size)>maxWidth && line){lines.push(line);line=char;}
      else line=next;
    }
    lines.push(line);
  }
  return lines;
}
async function buildCorporateCircularPdf(company, data, options={}) {
  const d=normalizeCircular(data),year=clean(company.year,8),templatePath=options.templatePath||TEMPLATE;
  if(!fs.existsSync(templatePath))throw new Error('ไม่พบ PDF เทมเพลตเอกสารเวียน');
  const source=await PDFDocument.load(fs.readFileSync(templatePath)),pdf=await PDFDocument.create();
  const [front]=await pdf.copyPages(source,[0]);pdf.addPage(front);
  pdf.registerFontkit(fontkit);
  const fontPath=options.fontPath||fontFile();
  if(!fontPath)throw new Error('ไม่พบฟอนต์ภาษาไทยบน Server กรุณาตั้ง CORPORATE_REPORT_THAI_FONT');
  const font=await pdf.embedFont(fs.readFileSync(fontPath),{subset:true});
  const page=pdf.getPages()[0],height=page.getHeight(),ink=rgb(.08,.10,.14),white=rgb(1,1,1),extra=[];
  const text=(value,x,top,size=8)=>{if(value)page.drawText(String(value),{x,y:height-top,size,font,color:ink});};
  const rect=(x,top,width,h)=>page.drawRectangle({x,y:height-top-h,width,height:h,color:white});
  const fit=(label,value,x,top,width,maxLines=1,size=8,step=10)=>{
    const v=clean(value,3000);
    if(!v)return;
    const lines=splitByWidth(v,font,size,width);
    lines.slice(0,maxLines).forEach((line,i)=>text(line,x,top+i*step,size));
    if(lines.length>maxLines)extra.push({label,value:v});
  };
  // Static template has year 2569. Replace the year in the subject line for every saved company year.
  if(d.subject){rect(30,62,378,17);fit('เรื่อง',`เรื่อง ${d.subject}`,34,73,365,1,8.2);}
  else{rect(126,63,95,13);text(`ปี ${year||'-'}`,128,72,8.2);}
  if(d.recipient){rect(31,79,510,32);fit('เรียน',`เรียน ${d.recipient}`,35,88,500,2,8,11);}
  if(!d.walkIn)rect(470,113,118,12);
  fit('วันที่',d.issueDate,79,41,200,1,8.5);
  fit('เลขที่',d.documentNo,79,55,210,1,8.5);
  // Group 1: company, payor, tax and contact.
  fit('ชื่อบริษัท (ภาษาไทย)',company.name+(d.additionalCompanies.length?` (พร้อมบริษัทในเครือ ${d.additionalCompanies.length} บริษัท)` :''),142,134,255,1,8.2);
  fit('ชื่อบริษัท (ภาษาอังกฤษ)',d.companyNameEn,142,149,255,1,8.2);
  fit('เลขที่ผู้เสียภาษี',d.taxId,142,163,255,1,8.2);
  fit('ที่อยู่',d.address,142,177,255,1,8.0);
  fit('ผู้ประสานงาน',d.coordinator,142,191,255,1,8.2);
  fit('จำนวนพนักงาน',d.employeeCount,142,205,255,1,8.2);
  fit('Payor Code',d.payorCode,487,134,69,1,8.2);
  fit('Payor Plan',d.payorPlan,487,149,69,1,8.2);
  // Group 2 and 3. The checkboxes already exist in the supplied master template.
  fit('ระยะเวลาในการตรวจ',d.screeningPeriod,144,222,388,1,8.4);
  if(!d.listenResults)rect(135,230,9,9);
  if(!d.mealCoupon)rect(135,246,9,9);
  fit('แพทย์และพยาบาล',d.medicalStaff,235,237,316,1,8);
  const drawPrograms=(label,programs,top)=>{
    for(const [index,p] of programs.entries()) {
      if(index>=6){extra.push({label:`${label} รายการที่ ${index+1}`,value:`${p.name}  |  ${p.price}  |  ${p.code}`});continue;}
      const y=top+index*11;
      fit(`${label} ${index+1} ชื่อ`,p.name,138,y,255,1,7.7);
      fit(`${label} ${index+1} ราคา`,p.price,404,y,45,1,7.5);
      fit(`${label} ${index+1} รหัส`,p.code,454,y,102,1,7.5);
    }
  };
  drawPrograms('โปรแกรมที่โรงพยาบาล',d.hospitalPrograms,273);
  drawPrograms('โปรแกรมครอบครัว',d.familyPrograms,347);
  fit('การแสดงสิทธิ์เพื่อรับการตรวจ',d.eligibility,136,427,414,9,8.2,10.5);
  fit('การรายงานผล',d.reporting,136,543,414,6,8.2,10.5);
  fit('บัญชีลูกหนี้',d.receivables,136,609,414,8,8.2,10.5);
  fit('เจ้าหน้าที่ขาย',d.salesContact,136,710,414,1,8.2);
  fit('ผู้ลงนาม',d.signatory,394,773,160,1,8.2);
  if(d.additionalCompanies.length){
    for(const [index,co] of d.additionalCompanies.entries()){
      const lines=[`ชื่อบริษัทลูก (ไทย): ${co.name}`,co.nameEn&&`ชื่ออังกฤษ: ${co.nameEn}`,co.code&&`รหัสบริษัท: ${co.code}`,co.taxId&&`เลขผู้เสียภาษี: ${co.taxId}`,co.address&&`ที่อยู่: ${co.address}`,co.contact&&`ผู้ประสานงาน: ${co.contact}`,co.phone&&`เบอร์โทร: ${co.phone}`,co.employeeCount&&`จำนวนพนักงาน: ${co.employeeCount}`,co.payorCode&&`Payor Code: ${co.payorCode}`,co.payorPlan&&`Payor Plan: ${co.payorPlan}`].filter(Boolean);
      extra.push({label:`บริษัทในเครือ ${index+1}`,value:lines.join('\n')});
    }
  }
  if(d.appendixDetails) extra.push({label:'เอกสารแนบท้ายสัญญา',value:d.appendixDetails});
  if(extra.length) {
    const accent=rgb(.08,.42,.67),gray=rgb(.36,.42,.49);
    let annex=pdf.addPage([595.32,841.92]),top=54;
    const header=()=>{annex.drawText(`เอกสารแนบท้ายสัญญาการตรวจสุขภาพประจำปี ${year}`,{x:42,y:795,size:13,font,color:accent});annex.drawText(`${clean(company.name,180)}  |  ปี ${year}`,{x:42,y:769,size:9,font,color:gray});annex.drawLine({start:{x:42,y:755},end:{x:552,y:755},thickness:1,color:accent});top=105;};
    header();
    for(const block of extra) {
      const blockLines=[...splitByWidth(block.label,font,9.5,495),...splitByWidth(block.value,font,9,495)];
      if(top+blockLines.length*14+25>790){annex=pdf.addPage([595.32,841.92]);header();}
      annex.drawText(block.label,{x:46,y:841.92-top,size:9.5,font,color:accent});top+=18;
      for(const line of splitByWidth(block.value,font,9,495)) {
        if(top>781){annex=pdf.addPage([595.32,841.92]);header();}
        if(line)annex.drawText(line,{x:49,y:841.92-top,size:9,font,color:ink});top+=14;
      }
      top+=13;
    }
  }
  const bytes=await pdf.save();return Buffer.from(bytes);
}
module.exports={normalizeCircular,defaultCircular,buildCorporateCircularPdf,splitByWidth};
