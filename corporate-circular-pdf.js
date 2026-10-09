'use strict';
// Corporate circular / annual company letter, laid out against the provided Vimut PDF template.
// The user-provided template remains unmodified in templates/corporate-circular-template.pdf.
const fs = require('node:fs');
const path = require('node:path');
const { PDFDocument, rgb } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');
const {normalizeProgramMatrix,drawProgramMatrixPages} = require('./company-program-matrix');
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
  if(input.contacts!=null&&!Array.isArray(input.contacts))throw new Error('ข้อมูลผู้ประสานงานต้องเป็นรายการ');
  if((input.contacts||[]).length>30)throw new Error('ข้อมูลผู้ประสานงานเกิน 30 คน');
  o.contacts=(input.contacts||[]).map(row=>({name:clean(row?.name,150),phone:clean(row?.phone,60),email:clean(row?.email,180),note:clean(row?.note,250)})).filter(row=>row.name||row.phone||row.email||row.note);
  if(!o.contacts.length&&o.coordinator){const [name='',...phoneParts]=o.coordinator.split(' / ');o.contacts=[{name:clean(name,150),phone:clean(phoneParts.join(' / '),60),email:'',note:''}].filter(row=>row.name||row.phone)}
  o.programMatrix=normalizeProgramMatrix(input.programMatrix);
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
// Company numbers belong to section 1 (the corporate table), not to the
// unnumbered contract appendix.  Keep the numbering stable on every page.
const subsidiaryNumber=index=>`1.${index+1}`;
function contactSummary(contact={}){return [contact.name,contact.phone&&`โทร ${contact.phone}`,contact.email&&`อีเมล ${contact.email}`,contact.note].filter(Boolean).join(' · ')}
function inlineSubsidiaryCount(d){return Math.min(2,d.additionalCompanies.length)}
function drawCompanyGroupOne(pdf,page,font,company,d){
  const height=page.getHeight(),ink=rgb(.08,.10,.14),white=rgb(1,1,1),blue=rgb(.08,.38,.60);
  page.drawRectangle({x:43,y:height-211,width:514,height:82,color:white});
  const line=(value,x,top,width,size=7.3)=>{if(!value)return;const lines=splitByWidth(clean(value,1500).replace(/\n/g,' '),font,size,width);page.drawText(lines[0]||'',{x,y:height-top,size,font,color:ink});};
  line('บริษัทหลัก / ลูก',49,138,79,7.1);
  line(`บริษัทหลัก: ${company.name||'-'}`,140,138,409,8.0);
  line([d.companyNameEn&&`EN ${d.companyNameEn}`,d.taxId&&`เลขภาษี ${d.taxId}`,d.payorCode&&`Payor ${d.payorCode}`,d.payorPlan&&`Plan ${d.payorPlan}`].filter(Boolean).join('  ·  '),140,149,410,7.0);
  line([d.address&&`ที่อยู่ ${d.address}`,d.employeeCount&&`พนักงาน ${d.employeeCount}`].filter(Boolean).join('  ·  '),140,160,410,7.0);
  const firstContact=d.contacts?.[0];if(firstContact)line(`ผู้ประสานงาน 1: ${contactSummary(firstContact)}`,140,171,410,7.0);else if(d.coordinator)line(`ผู้ประสานงาน: ${d.coordinator}`,140,171,410,7.0);
  const visible=d.additionalCompanies.slice(0,inlineSubsidiaryCount(d));
  for(const [i,co] of visible.entries()){const top=184+i*11;page.drawText(subsidiaryNumber(i),{x:48,y:height-top,size:7.4,font,color:blue});line([co.name,co.code&&`รหัส ${co.code}`,co.taxId&&`เลขภาษี ${co.taxId}`,co.payorCode&&`Payor ${co.payorCode}`,co.payorPlan&&`Plan ${co.payorPlan}`].filter(Boolean).join('  ·  '),140,top,408,7.1)}
  if(d.additionalCompanies.length>visible.length)line(`บริษัทลูก ${subsidiaryNumber(visible.length)} เป็นต้นไป ดูรายละเอียดต่อในหน้าข้อมูลบริษัท`,48,207,503,7.0);
  page.drawLine({start:{x:132,y:height-129},end:{x:132,y:height-210},thickness:.5,color:rgb(.22,.23,.25)});page.drawLine({start:{x:43,y:height-211},end:{x:557,y:height-211},thickness:.6,color:rgb(.22,.23,.25)});
}
function drawCompanySectionContinuation(pdf,font,company,d,visibleSubs=0){
  const remaining=d.additionalCompanies.slice(visibleSubs),remainingContacts=(d.contacts||[]).slice(1);if(!remaining.length&&!remainingContacts.length)return;
  const pageWidth=595.32,pageHeight=841.92,ink=rgb(.08,.10,.14),blue=rgb(.08,.38,.60),light=rgb(.92,.96,.98),rule=rgb(.68,.73,.77);let page,top=0;
  const write=(value,x,y,size=9,color=ink)=>page.drawText(String(value),{x,y:pageHeight-y,size,font,color});
  const header=()=>{page=pdf.addPage([pageWidth,pageHeight]);write(`1 ข้อมูลบริษัท (ต่อ) — ปี ${clean(company.year,8)}`,42,49,13,blue);write(`${clean(company.name,180)} · รายละเอียดบริษัทลูกและผู้ประสานงาน`,42,72,9);page.drawLine({start:{x:42,y:pageHeight-83},end:{x:553,y:pageHeight-83},thickness:1,color:blue});top=99};
  const ensure=h=>{if(!page||top+h+20>pageHeight-48)header()};
  for(const [offset,co] of remaining.entries()){const i=visibleSubs+offset,fields=[[co.nameEn&&`ชื่อภาษาอังกฤษ: ${co.nameEn}`,co.code&&`รหัสบริษัท: ${co.code}`,co.taxId&&`เลขภาษี: ${co.taxId}`].filter(Boolean).join('  ·  '),co.address&&`ที่อยู่: ${co.address}`,[co.employeeCount&&`พนักงาน: ${co.employeeCount}`,co.payorCode&&`Payor Code: ${co.payorCode}`,co.payorPlan&&`Payor Plan: ${co.payorPlan}`].filter(Boolean).join('  ·  ')].filter(Boolean),wrapped=fields.flatMap(value=>splitByWidth(value,font,8.4,483)),h=Math.max(46,32+wrapped.length*14);ensure(h);page.drawRectangle({x:42,y:pageHeight-top-h,width:511,height:h,color:light});write(`${subsidiaryNumber(i)}  ${co.name}`,49,top+18,9.6,blue);wrapped.forEach((value,j)=>value&&write(value,49,top+35+j*14,8.4));page.drawLine({start:{x:42,y:pageHeight-top-h},end:{x:553,y:pageHeight-top-h},thickness:.35,color:rule});top+=h+10}
  if(remainingContacts.length){ensure(55);write('ผู้ประสานงานบริษัท (ต่อ)',49,top+16,10,blue);top+=28;for(const [offset,c] of remainingContacts.entries()){const lines=splitByWidth(`ผู้ประสานงาน ${offset+2}: ${contactSummary(c)}`,font,8.6,490),h=Math.max(27,10+lines.length*13);ensure(h);lines.forEach((value,j)=>value&&write(value,49,top+13+j*13,8.6));top+=h}}
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
  // Group 1: show subsidiary 1.1, 1.2, ... *inside section 1* rather than
  // generating unrelated "บริษัทในเครือ" blocks at the end of the letter.
  if(d.additionalCompanies.length)drawCompanyGroupOne(pdf,page,font,company,d);
  else{
    fit('ชื่อบริษัท (ภาษาไทย)',company.name,142,134,255,1,8.2);
    fit('ชื่อบริษัท (ภาษาอังกฤษ)',d.companyNameEn,142,149,255,1,8.2);
    fit('เลขที่ผู้เสียภาษี',d.taxId,142,163,255,1,8.2);
    fit('ที่อยู่',d.address,142,177,255,1,8.0);
    fit('ผู้ประสานงาน',d.contacts?.length?contactSummary(d.contacts[0]):d.coordinator,142,191,255,1,8.2);
    fit('จำนวนพนักงาน',d.employeeCount,142,205,255,1,8.2);
    fit('Payor Code',d.payorCode,487,134,69,1,8.2);
    fit('Payor Plan',d.payorPlan,487,149,69,1,8.2);
  }
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
  drawPrograms('โปรแกรมพนักงาน',d.hospitalPrograms,273);
  drawPrograms('โปรแกรมครอบครัว',d.familyPrograms,347);
  fit('การแสดงสิทธิ์เพื่อรับการตรวจ',d.eligibility,136,427,414,9,8.2,10.5);
  fit('การรายงานผล',d.reporting,136,543,414,6,8.2,10.5);
  fit('บัญชีลูกหนี้',d.receivables,136,609,414,8,8.2,10.5);
  fit('เจ้าหน้าที่ขาย',d.salesContact,136,710,414,1,8.2);
  fit('ผู้ลงนาม',d.signatory,394,773,160,1,8.2);
  // Continuation pages follow row 1 directly. They are not part of the
  // miscellaneous contract appendix and repeat the same 1.x numbering.
  drawCompanySectionContinuation(pdf,font,company,d,d.additionalCompanies.length?inlineSubsidiaryCount(d):0);
  // v7.64.00: do not create the duplicate contract-appendix page requested for removal.
  // Uploaded PDFs remain the official attachments and are merged after section 09.
  if(extra.length) {
    const accent=rgb(.08,.42,.67),gray=rgb(.36,.42,.49);
    let annex=pdf.addPage([595.32,841.92]),top=54;
    const header=()=>{annex.drawText(`รายละเอียดเอกสารเวียน (ต่อ) ปี ${year}`,{x:42,y:795,size:13,font,color:accent});annex.drawText(`${clean(company.name,180)}  |  ปี ${year}`,{x:42,y:769,size:9,font,color:gray});annex.drawLine({start:{x:42,y:755},end:{x:552,y:755},thickness:1,color:accent});top=105;};
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
  // Section 09: editable corporate comparison matrix. It is a separate
  // portrait A4 appendix, inserted BEFORE uploaded PDF attachments.
  let embeddedLogo;
  const logoFile=path.join(__dirname,'assets','vimut-logo.png');
  if(fs.existsSync(logoFile)){
    try{embeddedLogo=await pdf.embedPng(fs.readFileSync(logoFile))}catch(_){/* logo is optional */}
  }
  drawProgramMatrixPages(pdf,font,company,d.programMatrix,{embeddedLogo});
  const bytes=await pdf.save();return Buffer.from(bytes);
}
module.exports={normalizeCircular,defaultCircular,buildCorporateCircularPdf,splitByWidth,subsidiaryNumber};
