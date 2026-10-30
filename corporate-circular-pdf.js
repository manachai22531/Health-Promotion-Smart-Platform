'use strict';
// Annual company circular built as flowing tables from saved sections 00–10.
// The legacy static corporate template is retained for compatibility but is no longer copied into output.
const fs = require('node:fs');
const path = require('node:path');
const { PDFDocument, rgb } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');
const {normalizeProgramMatrix,drawProgramMatrixPages} = require('./company-program-matrix');
const {appendAnnualCircularSections} = require('./corporate-circular-sections');
const {createPdfWrapper}=require('./pdf-text-layout');
const {cachedFile,prepareTheme,drawHeader,drawFooters}=require('./circular-pdf-theme');

const TEXT_FIELDS = Object.freeze({
  issueDate: 35, documentNo: 100, companyNameEn: 180, taxId: 45,
  address: 800, coordinator: 600, employeeCount: 30, payorCode: 100,
  payorPlan: 150, screeningPeriod: 300, medicalStaff: 250, programConditions: 2500,
  eligibility: 2500, reporting: 2500, receivables: 2500,
  salesContact: 350, signatory: 180, appendixDetails: 3500, subject: 250, recipient: 700,
  medicalDetails: 1000, financeDetails: 1000, receivableDetails: 1000, serviceFormat: 1000
});
function clean(value, max=400) { return String(value == null ? '' : value).replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0,max); }
function normalizeCircular(input={}) {
  if(!input || typeof input !== 'object' || Array.isArray(input))throw new Error('รูปแบบหนังสือเวียนไม่ถูกต้อง');
  const o={};
  for (const [key,max] of Object.entries(TEXT_FIELDS)) o[key]=clean(input[key],max);
  o.listenResults = input.listenResults === true;
  o.mealCoupon = input.mealCoupon === true;
  o.noListenResults = input.noListenResults === true && !o.listenResults;
  o.noMealCoupon = input.noMealCoupon === true && !o.mealCoupon;
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
  if(input.additionalCompanies != null && !Array.isArray(input.additionalCompanies))throw new Error('ข้อมูลบริษัทในเครือต้องเป็นรายการ');
  if((input.additionalCompanies||[]).length>20)throw new Error('ข้อมูลบริษัทในเครือเกิน 20 บริษัท');
  const subsidiaryFields={name:150,nameEn:150,taxId:50,code:50,address:600,contact:150,phone:60,employeeCount:30,payorCode:100,payorPlan:100};
  o.additionalCompanies=(input.additionalCompanies||[]).map(row=>Object.fromEntries(Object.entries(subsidiaryFields).map(([key,max])=>[key,clean(row?.[key],max)]))).filter(row=>row.name);
  if(input.coordinators!=null&&!Array.isArray(input.coordinators))throw new Error('ข้อมูลผู้ประสานงานไม่ถูกต้อง');
  if((input.coordinators||[]).length>30)throw new Error('เพิ่มผู้ประสานงานได้ไม่เกิน 30 คน');
  o.coordinators=(input.coordinators||[]).map(row=>({name:clean(row?.name,150),phone:clean(row?.phone,60),email:clean(row?.email,180)})).filter(row=>row.name||row.phone||row.email);
  if(!o.coordinators.length&&o.coordinator){
    o.coordinators=o.coordinator.split('\n').map(line=>{const parts=line.split(/\s+-\s+|\s+\/\s+/);return{name:clean(parts[0],150),phone:clean(parts.slice(1).join(' / '),60),email:''}}).filter(row=>row.name||row.phone);
  }
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
    path.join(__dirname,'assets/fonts/Sarabun-Regular.ttf'),
    path.join(windir,'Fonts','tahoma.ttf'),
    path.join(windir,'Fonts','THSarabunNew.ttf'),
    '/usr/share/fonts/truetype/freefont/FreeSerif.ttf',
    '/usr/share/fonts/truetype/noto/Sarabun-Regular.ttf',
    '/usr/share/fonts/truetype/noto/NotoLoopedThai-Regular.ttf'
  ].find(file=>file && fs.existsSync(file));
}
function splitByWidth(text,font,size,maxWidth){return createPdfWrapper(font)(text,size,maxWidth)}
async function buildCorporateCircularPdf(company, data, options={}) {
  const d=normalizeCircular(data),year=clean(company.year,8);
  const pdf=await PDFDocument.create(),topics=[];pdf.registerFontkit(fontkit);
  const fontPath=options.fontPath||fontFile();
  if(!fontPath)throw new Error('ไม่พบฟอนต์ภาษาไทยบน Server กรุณาตั้ง CORPORATE_REPORT_THAI_FONT');
  const font=await pdf.embedFont(cachedFile(fontPath),{subset:true});
  const theme=await prepareTheme(pdf,font,fontPath),wrap=createPdfWrapper(font);
  appendAnnualCircularSections(pdf,font,company,d,{theme,
    onTopic:(title,page,top)=>topics.push({title,page,top}),
    extraExaminationCount:(Array.isArray(company.billingPackages)?company.billingPackages.length:0) +
      (Array.isArray(company.cashPackages)?company.cashPackages.length:0)
  });
  // 00–08 are now complete flowing tables, not text stamped over a fixed PDF.
  // 12 and 13 remain data-driven tables; uploaded attachments are merged server-side.
  let programPageCount=0;
  const hasMatrix=Boolean(d.programMatrix.programs.length && d.programMatrix.rows.length);
  // The user-edited Word template places employee/family program name,
  // price and code INSIDE the continuous main table. Do not duplicate the
  // basic program list on an extra page; specialized matrix pages remain
  // separate only when a real test matrix exists.
  if(hasMatrix){
    const matrixStart=pdf.getPageCount();
    programPageCount+=drawProgramMatrixPages(pdf,font,company,d.programMatrix,{theme,data:d});
    if(pdf.getPageCount()>matrixStart)topics.push({title:'ตารางเปรียบเทียบโปรแกรม',page:pdf.getPages()[matrixStart]});
  }
  const additional=[...(Array.isArray(company.billingPackages)?company.billingPackages:[]).map(p=>({...p,billingType:'วางบิล'})),...(Array.isArray(company.cashPackages)?company.cashPackages:[]).map(p=>({...p,billingType:'เงินสด'}))];
  if(additional.length||d.appendixDetails){
    const columns=[{label:'ลำดับ',width:24},{label:'การชำระ',width:43},{label:'Code',width:100},{label:'รายการตรวจเพิ่มเติม',width:274},{label:'จำนวน',width:30},{label:'ราคา/หน่วย',width:60}],left=32;
    let page,top,rowNo=0;
    const moneyValue=v=>{const n=Number(v);return Number.isFinite(n)?n.toLocaleString('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2}):clean(v,40)};
    const addPage=()=>{page=pdf.addPage([595.32,841.92]);const y=drawHeader(page,theme,'รายการตรวจเพิ่มเติม',company,d,wrap);if(rowNo===0&&!topics.some(t=>t.title==='รายการตรวจเพิ่มเติม'))topics.push({title:'รายการตรวจเพิ่มเติม',page,top:841.92-y});top=y;let x=left;for(const col of columns){page.drawRectangle({x,y:841.92-top-28,width:col.width,height:28,color:theme.blue});wrap(col.label,6.7,col.width-8).forEach((t,i)=>page.drawText(t,{x:x+4,y:841.92-top-11-i*8,size:6.7,font:theme.bold,color:theme.white}));x+=col.width}top+=28};
    addPage();
    for(const item of additional){const cells=[String(++rowNo),item.billingType,String(item.code||item.packageCode||item.package_code||'—'),item.name||item.packageName||item.code||'—',String(item.quantity||1),moneyValue(item.unitPrice??item.price)];
      const prepared=cells.map((v,i)=>wrap(v,i===2?6.8:7.2,columns[i].width-8)),lineCount=Math.max(...prepared.map(x=>x.length)),height=Math.max(31,lineCount*10+12);
      if(top+height>791)addPage();let x=left;
      cells.forEach((value,i)=>{const col=columns[i],size=i===2?6.8:7.2;page.drawRectangle({x,y:841.92-top-height,width:col.width,height:height,color:rowNo%2?theme.white:theme.stripe});page.drawLine({start:{x,y:841.92-top-height},end:{x:x+col.width,y:841.92-top-height},thickness:.45,color:theme.grid});prepared[i].forEach((t,j)=>{const tx=i===5?x+col.width-4-font.widthOfTextAtSize(t,size):x+4;page.drawText(t,{x:tx,y:841.92-top-12-j*10,font,size,color:i===2?theme.blue:theme.ink})});x+=col.width});top+=height;
    }
    if(d.appendixDetails){top+=14;for(const t of wrap('หมายเหตุ: '+d.appendixDetails,7.6,523)){if(top+11>791)addPage();page.drawText(t,{x:left+4,y:841.92-top-8,font,size:7.6,color:theme.ink});top+=11}}
  }
  drawFooters(pdf,theme,company);
  // The PDF page sequence is already correct: 00–08 → 09 → 10.
  // Do not insert the legacy template, company directory annex or continuation pages.
  require('./pdf-outline').setOutline(pdf,topics);
  return Buffer.from(await pdf.save());
}
module.exports={normalizeCircular,defaultCircular,buildCorporateCircularPdf,splitByWidth};
