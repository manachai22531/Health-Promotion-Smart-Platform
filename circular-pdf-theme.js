'use strict';
const fs=require('node:fs'),path=require('node:path'),{rgb}=require('pdf-lib');
const palette={blue:rgb(.114,.361,.588),green:rgb(.518,.741,0),ink:rgb(.137,.235,.286),muted:rgb(.39,.50,.56),grid:rgb(.85,.89,.92),label:rgb(.95,.97,.98),stripe:rgb(.965,.976,.984),paleGreen:rgb(.933,.961,.875),na:rgb(.93,.945,.953),white:rgb(1,1,1)};
const byteCache=new Map();
function cachedFile(file){const stat=fs.statSync(file),signature=stat.mtimeMs+':'+stat.size;let item=byteCache.get(file);if(!item||item.signature!==signature){item={signature,bytes:fs.readFileSync(file)};if(byteCache.size>=8)byteCache.clear();byteCache.set(file,item)}return item.bytes}
async function prepareTheme(pdf,font,fontPath){const boldPath=path.join(__dirname,'assets/fonts/Sarabun-Bold.ttf'),bold=fontPath===path.join(__dirname,'assets/fonts/Sarabun-Regular.ttf')?await pdf.embedFont(cachedFile(boldPath),{subset:true}):font;const logo=await pdf.embedPng(cachedFile(path.join(__dirname,'assets/vimut-logo.png')));return{...palette,font,bold,logo}}
function drawHeader(page,theme,title,company,data,wrap){const H=page.getHeight(),LEFT=32,RIGHT=page.getWidth()-32,text=(value,x,top,size=8,font=theme.font,color=theme.ink)=>page.drawText(String(value||''),{x,y:H-top-size,font,size,color});
 page.drawImage(theme.logo,{x:LEFT,y:H-67,width:46,height:46});
 const titleLines=wrap(title,12.2,330);titleLines.forEach((t,i)=>text(t,LEFT+58,21+i*14,12.2,theme.bold,theme.blue));const nameLines=wrap(company?.name||'บริษัท',8.2,325);nameLines.forEach((t,i)=>text(t,LEFT+58,43+((titleLines.length-1)*14)+i*10,8.2,theme.bold));
 let date=String(data?.issueDate||'—'),m=date.match(/^(\d{4})-(\d{2})-(\d{2})$/);if(m)date=`${m[3]}/${m[2]}/${+m[1]<2400?+m[1]+543:m[1]}`;
 // Metadata stays in a separate column, never under the title.
 const metaX=RIGHT-100;const titleRight=LEFT+58+Math.max(...titleLines.map(t=>theme.bold.widthOfTextAtSize(t,12.2)),0);
 const metaTop=titleRight>metaX-8?68:20;
 const dateLines=wrap(date,6.7,51),docTop=metaTop+Math.max(13,dateLines.length*8+3);text('วันที่เอกสาร',metaX,metaTop,6.3);dateLines.forEach((t,i)=>text(t,metaX+49,metaTop+i*8,6.7,theme.bold));text('เลขที่หนังสือ',metaX,docTop,6.3);const docLines=wrap(data?.documentNo||'—',6.5,51);docLines.forEach((t,i)=>text(t,metaX+49,docTop+i*8,6.5));
 const bottom=Math.max(72,43+((titleLines.length-1)*14)+nameLines.length*10+8,docTop+docLines.length*8+8);page.drawLine({start:{x:LEFT,y:H-bottom},end:{x:RIGHT,y:H-bottom},thickness:1.5,color:theme.green});return bottom+12;
}
function drawFooters(pdf,theme,company){const pages=pdf.getPages();pages.forEach((p,i)=>{const y=23;p.drawLine({start:{x:32,y:y+11},end:{x:p.getWidth()-32,y:y+11},thickness:.45,color:theme.grid});p.drawText('เอกสารเวียนภายใน · ประจำปี '+String(company.year||''),{x:32,y,size:6,font:theme.font,color:theme.muted});const t=`หน้า ${i+1}`;p.drawText(t,{x:p.getWidth()-32-theme.font.widthOfTextAtSize(t,6),y,size:6,font:theme.font,color:theme.muted})})}
module.exports={palette,cachedFile,prepareTheme,drawHeader,drawFooters};
