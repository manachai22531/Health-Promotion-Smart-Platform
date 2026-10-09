'use strict';
const {rgb} = require('pdf-lib');
const fs=require('fs');
const path=require('path');
const cap=(v,n=200)=>String(v??'').replace(/[\x00-\x1f\x7f]/g,' ').trim().slice(0,n);
function normalizeProgramMatrix(raw){
  if(raw == null)return {programs:[],rows:[],note:''};
  if(typeof raw!=='object'||Array.isArray(raw)||!Array.isArray(raw.programs)||!Array.isArray(raw.rows))throw new Error('ตารางโปรแกรมต้องมีรายการโปรแกรมและรายการตรวจ');
  if(raw.programs.length>10||raw.rows.length>200)throw new Error('ตารางโปรแกรมเกินจำนวนที่กำหนด (10 โปรแกรม / 200 รายการ)');
  const programs=raw.programs.map(p=>({name:cap(p?.name,90),price:Math.min(999999999,Math.max(0,Number(p?.price)||0))}));
  const rows=raw.rows.map((r,i)=>({no:cap(r?.no||String(i+1),12),en:cap(r?.en,230),th:cap(r?.th,400),checks:programs.map((_,j)=>['yes','na','blank'].includes(r?.checks?.[j])?r.checks[j]:'blank')}));
  return {programs,rows,note:cap(raw.note,1000)};
}
function drawProgramMatrixPages(pdf,font,company,matrix,opts={}){
 const d=normalizeProgramMatrix(matrix);if(!d.programs.length||!d.rows.length)return 0;
 const totalPagesBefore=pdf.getPageCount(),year=cap(company.year,10),companyName=cap(company.name,150);
 const black=rgb(.08,.12,.16),blue=rgb(.06,.34,.58),grid=rgb(.29,.34,.38),gray=rgb(.65,.68,.7),white=rgb(1,1,1),pale=rgb(.91,.95,.98);
 const logoPath=opts.logoPath||path.join(__dirname,'assets','vimut-logo.png');
 const chunks=[];for(let s=0;s<d.programs.length;s+=5)chunks.push({start:s,programs:d.programs.slice(s,s+5)});
 const pw=595.28,ph=841.89,margin=29,usable=pw-2*margin,noW=21,enW=139,thW=172;
 const wrap=(s,size,width,limit=3)=>{
  const source=String(s||'').replace(/\r/g,'').split('\n');const all=[];
  const segments=typeof Intl.Segmenter==='function'?new Intl.Segmenter('th',{granularity:'grapheme'}):null;
  for(const part of source){const chars=segments?[...segments.segment(part)].map(x=>x.segment):Array.from(part);let line='';for(const char of chars){let n=line+char;if(font.widthOfTextAtSize(n,size)>width&&line){all.push(line);line=char}else line=n;}all.push(line)}
  return all.slice(0,limit);
 };
 const text=(page,s,x,top,size=7,color=black)=>{if(s)page.drawText(String(s),{x,y:ph-top-size,size,font,color})};
 const cell=(page,x,top,w,h,fill)=>{page.drawRectangle({x,y:ph-top-h,width:w,height:h,borderColor:grid,borderWidth:.45,...(fill?{color:fill}:{})})};
 const lines=(page,str,x,top,width,height,size=7,max=2,center=false,color=black)=>{
  let arr=wrap(str,size,width-5,max);let baseline=top+(height-arr.length*(size+2))/2;
  arr.forEach((l,i)=>{const sw=font.widthOfTextAtSize(l,size);text(page,l,center?x+(width-sw)/2:x+3,baseline+i*(size+2),size,color)});
 };
 const check=(page,x,top,w,h)=>{const midX=x+w/2,midY=ph-top-h/2;page.drawLine({start:{x:midX-4,y:midY+.2},end:{x:midX-1,y:midY-3},thickness:1.6,color:black});page.drawLine({start:{x:midX-1,y:midY-3},end:{x:midX+5,y:midY+4},thickness:1.6,color:black})};
 for(const chunk of chunks){
  const progW=(usable-noW-enW-thW)/chunk.programs.length,columns=[noW,enW,thW,...chunk.programs.map(()=>progW)];
  let page,rowTop;
  const add=()=>{
   page=pdf.addPage([pw,ph]);let logo=null;
   if(fs.existsSync(logoPath)){try{const bytes=fs.readFileSync(logoPath);logo=bytes[0]===0x89?'png':'jpg';const embed=opts.embeddedLogo;if(embed){const scale=Math.min(49/embed.width,42/embed.height);page.drawImage(embed,{x:margin+4,y:ph-81,width:embed.width*scale,height:embed.height*scale})}}catch(_){}}
   text(page,`เอกสารแนบท้ายสัญญาการตรวจสุขภาพประจำปี ${year}`,156,33,12,black);
   lines(page,`บริษัท ${companyName}`,100,54,425,19,9,1,true);
   text(page,`ตารางโปรแกรมตรวจสุขภาพ ${chunks.length>1?`(ชุด ${Math.floor(chunk.start/5)+1}/${chunks.length})`:''}`,margin,90,9,blue);
   rowTop=111;
   cell(page,margin,rowTop,noW,59,pale);lines(page,'No.',margin,rowTop,noW,59,7,1,true);
   cell(page,margin+noW,rowTop,enW+thW,59,pale);lines(page,'Program check up / รายการตรวจสุขภาพ',margin+noW,rowTop,enW+thW,59,8,2,true);
   let x=margin+noW+enW+thW;
   for(const p of chunk.programs){cell(page,x,rowTop,progW,59,pale);lines(page,p.name,x,rowTop+4,progW,48,6.3,4,true);x+=progW}
   rowTop+=59;
  };
  add();
  for(const r of d.rows){
   const enLines=wrap(r.en,6.8,enW-6,3),thLines=wrap(r.th,6.8,thW-6,3),h=Math.max(17,Math.min(37,Math.max(enLines.length,thLines.length)*9+5));
   if(rowTop+h>ph-82){add()}
   let x=margin;cell(page,x,rowTop,noW,h);lines(page,r.no,x,rowTop,noW,h,6.7,1,true);x+=noW;
   cell(page,x,rowTop,enW,h);lines(page,r.en,x,rowTop,enW,h,6.8,3,false);x+=enW;
   cell(page,x,rowTop,thW,h);lines(page,r.th,x,rowTop,thW,h,6.8,3,false);x+=thW;
   for(let i=0;i<chunk.programs.length;i++){
    const choice=r.checks[chunk.start+i]||'blank';cell(page,x,rowTop,progW,h,choice==='na'?gray:undefined);if(choice==='yes')check(page,x,rowTop,progW,h);x+=progW;
   }
   rowTop+=h;
  }
  if(rowTop+30>ph-55){add()}
  let x=margin;cell(page,x,rowTop,noW+enW+thW,29,pale);lines(page,'ราคาพิเศษ / คน (บาท)',x,rowTop,noW+enW+thW,29,7.5,1,true);x+=noW+enW+thW;
  for(const p of chunk.programs){cell(page,x,rowTop,progW,29,pale);lines(page,new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(p.price),x,rowTop,progW,29,7,1,true);x+=progW}
  if(d.note&&chunk.start===0){const noteLines=wrap(d.note,8,usable,4);let top=Math.min(ph-42,rowTop+47);for(const line of noteLines){if(top>ph-21)break;text(page,line,margin,top,8);top+=12}}
  page.drawLine({start:{x:margin,y:24},end:{x:pw-margin,y:24},thickness:.5,color:gray});
 }
 return pdf.getPageCount()-totalPagesBefore;
}
module.exports={normalizeProgramMatrix,drawProgramMatrixPages};
