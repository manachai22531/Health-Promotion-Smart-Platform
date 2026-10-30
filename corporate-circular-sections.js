'use strict';
/**
 * Corporate annual circular — continuous compact A4 Word-table layout.
 * This reproduces the user-edited Word document, not the legacy blue section
 * bands.  It receives normalized circular data; the caller owns PDF saving.
 * All rows are data-driven, with page breaks for variable-length content.
 */
const {rgb}=require('pdf-lib');
const {createPdfWrapper}=require('./pdf-text-layout');
const {drawHeader}=require('./circular-pdf-theme');

function appendAnnualCircularSections(pdf,font,company={},data={},options={}) {
  const W=595.32,H=841.92,LEFT=32,RIGHT=563.32,BOTTOM=37;
  const TABLE_WIDTH=RIGHT-LEFT;
  // Word template uses four visual cells: label, value, payor/phone/price, code/email.
  const widths=[112,249,65.0,TABLE_WIDTH-426.0];
  const xs=[LEFT,LEFT+widths[0],LEFT+widths[0]+widths[1],LEFT+widths[0]+widths[1]+widths[2],RIGHT];
  const theme=options.theme,black=theme?.ink||rgb(.10,.10,.10),line=theme?.grid||rgb(.24,.24,.24),white=rgb(1,1,1);
  const SAFE=(v,empty='—')=>String(v??'').replace(/\r\n?/g,'\n').trim()||empty;
  const trim=(v)=>String(v??'').trim();
  const FONT_SIZE=7.2,LINE_H=9.0,MIN_ROW=13.6,XPAD=4,YPAD=2.0;
  let page=null,y=0,count=0;
  const split=createPdfWrapper(font);
  function drawText(value,x,top,size=FONT_SIZE,caption=false){
    if(value)page.drawText(String(value),{x,y:H-top-size,font:caption&&theme?theme.bold:font,size,color:caption&&theme?theme.blue:black});
  }
  function drawBox(x,top,w,h,caption=false){
    page.drawRectangle({x,y:H-top-h,width:w,height:h,color:caption&&theme?theme.label:white,borderColor:line,borderWidth:.35});
  }
  function dateLabel(value){
    const s=trim(value);const m=s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if(m){let year=+m[1];if(year<2400)year+=543;return `${m[3]}/${m[2]}/${year}`;}
    return s||'—';
  }
  function header(){
    page=pdf.addPage([W,H]);count++;
    if(theme){y=drawHeader(page,theme,'เอกสารเวียนตรวจสุขภาพประจำปี',company,data,split);return;}
    drawText('เอกสารเวียนตรวจสุขภาพประจำปี',LEFT+1,19,12.2);
    const titleCompany=SAFE(company.name,'บริษัท');
    split(titleCompany,10.6,300).slice(0,2).forEach((t,i)=>drawText(t,LEFT+1,41+i*12,10.6));
    drawText('วันที่เอกสาร',421,19,8.0);
    drawText(dateLabel(data.issueDate),481,19,8.2);
    drawText('เลขที่หนังสือ',421,38,8.0);
    const docNoLines=split(SAFE(data.documentNo),8.1,82);docNoLines.slice(0,2).forEach((t,i)=>drawText(t,481,38+i*9.4,8.1));
    y=78;
  }
  function ensure(height){if(!page||y+height>H-BOTTOM)header();}
  /**
   * Cells: [{value,width,caption?}]  
   * 'merged' = label + a full-width detail cell. 'split' = 4 physical cells.
   * Each row repeats only overflow text on continuation pages, keeping alignment.
   */
  function row(values,{splitColumns=false,rightAlign=[],headerRow=false}={}){
    const w=splitColumns?widths:[widths[0],TABLE_WIDTH-widths[0]];
    const valuesPrepared=splitColumns?values:[values[0],values[1]];
    const allLines=valuesPrepared.map((v,i)=>split(String(v??''),FONT_SIZE,w[i]-XPAD*2));
    let start=0;
    const maxLines=Math.max(...allLines.map(lines=>lines.length),1);
    while(start<maxLines){
      ensure(MIN_ROW);
      const available=Math.floor((H-BOTTOM-y-YPAD*2)/LINE_H);
      if(available<1){header();continue;}
      const take=Math.min(available,maxLines-start);
      const h=Math.max(MIN_ROW,YPAD*2+take*LINE_H);
      if(y+h>H-BOTTOM+.1){header();continue;}
      let x=LEFT;
      for(let i=0;i<w.length;i++){
        drawBox(x,y,w[i],h,i===0||headerRow);
        for(let j=0;j<take;j++){const value=allLines[i][start+j]||'',tx=rightAlign.includes(i)?x+w[i]-XPAD-font.widthOfTextAtSize(value,FONT_SIZE):x+XPAD;drawText(value,tx,y+YPAD+j*LINE_H,FONT_SIZE,i===0||headerRow);}
        x+=w[i];
      }
      y+=h;start+=take;
    }
  }
  const topics=new Set(['เรื่อง','ชื่อบริษัท (ภาษาไทย)','ผู้ประสานงาน','ช่วงวันที่ตรวจ','โปรแกรมพนักงาน','โปรแกรมครอบครัว','เงื่อนไขโปรแกรมตรวจ','ต้อนรับและการเงิน','การแสดงสิทธิ์ / การเงิน','เงื่อนไขการรายงานผล','บัญชีลูกหนี้','เจ้าหน้าที่ขาย']);const marked=new Set();
  function mark(label){if(topics.has(label)&&!marked.has(label)){ensure(MIN_ROW);options.onTopic?.(label==='เรื่อง'?'ข้อมูลเอกสาร':label,page,H-y);marked.add(label)}}
  const field=(label,value)=>{mark(label);row([label,SAFE(value)])};
  const pair=(label,value,extraLabel,extraValue)=>{mark(label);row([label,SAFE(value),extraLabel,SAFE(extraValue)],{splitColumns:true})};
  const contactRow=(label,c)=>{mark(label);row([label,SAFE(c?.name),SAFE(c?.phone),SAFE(c?.email)],{splitColumns:true})};
  function programRows(title,programs){
    mark(title);
    const items=Array.isArray(programs)?programs:[];
    if(!items.length){field(title,'—');return;}
    if(theme)row([title,'รายการตรวจ','ราคา (บาท)','Code'],{splitColumns:true,headerRow:true});
    for(const [i,p] of items.entries()){
      const price=p?.unitPrice??p?.price;
      const printablePrice=price==null||price===''?'—':
        (Number.isFinite(Number(String(price).replace(/,/g,'')))?Number(String(price).replace(/,/g,'')).toLocaleString('th-TH',{maximumFractionDigits:2}):SAFE(price));
      row([!theme&&i===0?title:'',SAFE(p?.name),printablePrice,SAFE(p?.code)],{splitColumns:true,rightAlign:[2]});
    }
  }
  // Word layout: letterhead is outside a SINGLE, continuous rectangular table.
  field('เรื่อง',data.subject||'การตรวจสุขภาพประจำปี');
  field('เรียน',data.recipient);
  field('รูปแบบบริการ',data.walkIn!==false?'Walk in ที่โรงพยาบาลวิมุต':data.serviceFormat);
  pair('ชื่อบริษัท (ภาษาไทย)',company.name,'Payor Code',data.payorCode);
  pair('ชื่อบริษัท (ภาษาอังกฤษ)',data.companyNameEn,'Payor Plan',data.payorPlan);
  field('เลขที่ผู้เสียภาษี',data.taxId);
  field('ที่อยู่บริษัท',data.address);
  for(const co of (Array.isArray(data.additionalCompanies)?data.additionalCompanies:[])){
    pair('ชื่อบริษัท (ภาษาไทย)',co.name,'Payor Code',co.payorCode);
    pair('ชื่อบริษัท (ภาษาอังกฤษ)',co.nameEn,'Payor Plan',co.payorPlan);
    field('เลขที่ผู้เสียภาษี',co.taxId);
    field('ที่อยู่บริษัท',co.address);
  }
  let contacts=(Array.isArray(data.coordinators)?data.coordinators:[]).filter(x=>x&&(x.name||x.phone||x.email));
  if(!contacts.length){
    contacts=trim(data.coordinator).split('\n').filter(Boolean).map(line=>{
      const parts=line.split(/\s+-\s+|\s+\/\s+/);
      return {name:parts[0]||'',phone:parts[1]||'',email:parts[2]||''};
    });
  }
  if(!contacts.length){contactRow('ผู้ประสานงาน',{});}else{
    for(const [i,c] of contacts.entries())contactRow(i===0?'ผู้ประสานงาน':'',c);
  }
  field('จำนวนพนักงานทั้งหมด',data.employeeCount);
  field('ช่วงวันที่ตรวจ',data.screeningPeriod);
  field('แพทย์ + พยาบาล',data.medicalStaff);
  field('รูปแบบการตรวจ',data.listenResults?'ตรวจแบบฟังผล':data.noListenResults?'ตรวจแบบไม่ฟังผล':'ตรวจตามเงื่อนไขบริษัท');
  field('คูปองอาหาร',data.mealCoupon?'มี':'ไม่มี');
  // No duplicate medical-staff value: this is a separate source field in Word.
  field('รายละเอียดเพิ่มเติม',data.medicalDetails);
  programRows('โปรแกรมพนักงาน',data.hospitalPrograms);
  programRows('โปรแกรมครอบครัว',data.familyPrograms);
  field('เงื่อนไขโปรแกรมตรวจ',data.programConditions);
  field('ต้อนรับและการเงิน',data.financeDetails);
  field('การแสดงสิทธิ์ / การเงิน',data.eligibility);
  field('เงื่อนไขการรายงานผล',data.reporting);
  field('บัญชีลูกหนี้',data.receivables);
  field('รายละเอียด / เงื่อนไข',data.receivableDetails);
  field('เจ้าหน้าที่ขาย',data.salesContact);
  const matrix=data.programMatrix||{},matrixCount=Array.isArray(matrix.rows)?matrix.rows.length:0;
  field('ตารางโปรแกรม',matrixCount?`มี ${matrixCount} รายการ (ดูตารางแนบ)`:'—');
  const additional=options.extraExaminationCount||0;
  field('รายการตรวจ',trim(data.appendixDetails)||(additional?`มี ${additional} รายการ (ดูตารางแนบ)`:'—'));
  return count;
}
module.exports={appendAnnualCircularSections};
