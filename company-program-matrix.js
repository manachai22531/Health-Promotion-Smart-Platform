'use strict';
const {rgb} = require('pdf-lib');
const {createPdfWrapper}=require('./pdf-text-layout');
const {drawHeader}=require('./circular-pdf-theme');
const cap=(v,n=200)=>String(v??'').replace(/[\x00-\x1f\x7f]/g,' ').trim().slice(0,n);
function normalizeProgramMatrix(raw){
  if(raw == null)return {programs:[],rows:[],note:''};
  if(typeof raw!=='object'||Array.isArray(raw)||!Array.isArray(raw.programs)||!Array.isArray(raw.rows))throw new Error('ตารางโปรแกรมต้องมีรายการโปรแกรมและรายการตรวจ');
  if(raw.programs.length>10||raw.rows.length>200)throw new Error('ตารางโปรแกรมเกินจำนวนที่กำหนด (10 โปรแกรม / 200 รายการ)');
  const programs=raw.programs.map(p=>({name:cap(p?.name,90),price:Math.min(999999999,Math.max(0,Number(p?.price)||0))}));
  const rows=raw.rows.map((r,i)=>({no:cap(r?.no||String(i+1),12),en:cap(r?.en,230),th:cap(r?.th,400),checks:programs.map((_,j)=>['yes','na','blank'].includes(r?.checks?.[j])?r.checks[j]:'blank')}));
  return {programs,rows,note:cap(raw.note,1000)};
}
function drawProgramMatrixPages(pdf,font,company,matrix,options={}){
 const theme=options.theme;
 const d=normalizeProgramMatrix(matrix);if(!d.programs.length||!d.rows.length)return 0;
 const totalPagesBefore=pdf.getPageCount(),year=cap(company.year,10),companyName=cap(company.name,150);
 const black=theme?.ink||rgb(0,0,0),grid=theme?.grid||rgb(0,0,0),white=rgb(1,1,1);let rowFill;
 const chunks=[];for(let s=0;s<d.programs.length;s+=5)chunks.push({start:s,programs:d.programs.slice(s,s+5)});
 const pw=595.28,ph=841.89,margin=theme?32:29,usable=pw-2*margin,noW=theme?22:21,enW=theme?132:139,thW=theme?174:172;
 const wrapAll=createPdfWrapper(font);
 const wrap=(s,size,width,limit=3)=>wrapAll(s,size,width).slice(0,limit);
 const text=(page,s,x,top,size=7,color=black)=>{if(s)page.drawText(String(s),{x,y:ph-top-size,size,font:theme&&color===white?theme.bold:font,color})};
 const cell=(page,x,top,w,h,fill)=>{page.drawRectangle({x,y:ph-top-h,width:w,height:h,borderColor:grid,borderWidth:.45,...((fill||rowFill)?{color:fill||rowFill}:{})})};
 const lines=(page,str,x,top,width,height,size=7,max=2,center=false,color=black)=>{
  let arr=wrap(str,size,width-5,max);let baseline=top+(height-arr.length*(size+2))/2;
  arr.forEach((l,i)=>{const sw=font.widthOfTextAtSize(l,size);text(page,l,center?x+(width-sw)/2:x+3,baseline+i*(size+2),size,color)});
 };
 const check=(page,x,top,w,h)=>{const midX=x+w/2,midY=ph-top-h/2;page.drawLine({start:{x:midX-4,y:midY+.2},end:{x:midX-1,y:midY-3},thickness:1.6,color:theme?.green||black});page.drawLine({start:{x:midX-1,y:midY-3},end:{x:midX+5,y:midY+4},thickness:1.6,color:theme?.green||black})};
 for(const chunk of chunks){
  const progW=(usable-noW-enW-thW)/chunk.programs.length,columns=[noW,enW,thW,...chunk.programs.map(()=>progW)];
  let page,rowTop;
  const add=()=>{
   page=pdf.addPage([pw,ph]);
   if(theme){
    rowTop=drawHeader(page,theme,'ตารางโปรแกรมตรวจสุขภาพ',company,options.data||{},wrapAll);
    const hh=44;rowFill=theme.blue;let x=margin;
    for(const [label,w] of [['ลำดับ',noW],['รายการตรวจ (English)',enW],['รายการตรวจสุขภาพ',thW],...chunk.programs.map(p=>[p.name,progW])]){cell(page,x,rowTop,w,hh,theme.blue);lines(page,label,x,rowTop,w,hh,6.1,4,false,white);x+=w}
    rowFill=undefined;rowTop+=hh;
   }else{
   // v7.64.21: remove the redundant numbered page title. Keep only company + table caption.
   lines(page,`บริษัท ${companyName}`,100,28,425,19,9,1,true);
   text(page,`ตารางโปรแกรมตรวจสุขภาพ ${chunks.length>1?`(ชุด ${Math.floor(chunk.start/5)+1}/${chunks.length})`:''}`,margin,57,9,black);
   rowTop=76;
   cell(page,margin,rowTop,noW,59);lines(page,'No.',margin,rowTop,noW,59,7,1,true);
   cell(page,margin+noW,rowTop,enW+thW,59);lines(page,'Program check up / รายการตรวจสุขภาพ',margin+noW,rowTop,enW+thW,59,8,2,true);
   let x=margin+noW+enW+thW;
   for(const p of chunk.programs){cell(page,x,rowTop,progW,59);lines(page,p.name,x,rowTop+4,progW,48,6.3,4,true);x+=progW}
   rowTop+=59;

   }
  };
  add();
  for(const [rowIndex,r] of d.rows.entries()){
   rowFill=theme?(rowIndex%2?theme.stripe:theme.white):undefined;
   const enLines=wrap(r.en,6.8,enW-6,3),thLines=wrap(r.th,6.8,thW-6,3),h=theme?Math.max(16,Math.max(wrapAll(r.en,6.8,enW-6).length,wrapAll(r.th,6.8,thW-6).length)*8.8+4):Math.max(17,Math.min(37,Math.max(enLines.length,thLines.length)*9+5));
   if(rowTop+h>ph-(theme?68:82)){add();rowFill=theme?(rowIndex%2?theme.stripe:theme.white):undefined}
   let x=margin;cell(page,x,rowTop,noW,h);lines(page,r.no,x,rowTop,noW,h,6.7,1,true);x+=noW;
   cell(page,x,rowTop,enW,h);lines(page,r.en,x,rowTop,enW,h,6.8,theme?100:3,false);x+=enW;
   cell(page,x,rowTop,thW,h);lines(page,r.th,x,rowTop,thW,h,6.8,theme?100:3,false);x+=thW;
   for(let i=0;i<chunk.programs.length;i++){
    const choice=r.checks[chunk.start+i]||'blank';cell(page,x,rowTop,progW,h,choice==='na'?(theme?theme.na:black):undefined);if(choice==='yes')check(page,x,rowTop,progW,h);else if(theme&&choice==='na')lines(page,'—',x,rowTop,progW,h,7,1,true,theme.muted);x+=progW;
   }
   rowTop+=h;
  }
  rowFill=theme?.paleGreen;
  if(rowTop+30>ph-55){add()}
  let x=margin;cell(page,x,rowTop,noW+enW+thW,29);lines(page,'ราคาพิเศษ / คน (บาท)',x,rowTop,noW+enW+thW,29,7.5,1,true);x+=noW+enW+thW;
  for(const p of chunk.programs){cell(page,x,rowTop,progW,29);lines(page,new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(p.price),x,rowTop,progW,29,7,1,true);x+=progW}
  if(d.note&&chunk.start===0){const noteLines=theme?wrapAll(d.note,8,usable):wrap(d.note,8,usable,4);let top=theme?rowTop+47:Math.min(ph-42,rowTop+47);for(const line of noteLines){if(theme&&top>ph-48){add();top=rowTop+12}else if(!theme&&top>ph-21)break;text(page,line,margin,top,8);top+=12}}
  if(!theme)page.drawLine({start:{x:margin,y:24},end:{x:pw-margin,y:24},thickness:.5,color:black});
 }
 return pdf.getPageCount()-totalPagesBefore;
}
module.exports={normalizeProgramMatrix,drawProgramMatrixPages};
