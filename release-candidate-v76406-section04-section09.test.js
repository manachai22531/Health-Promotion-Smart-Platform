const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {buildCorporateCircularPdf}=require('./corporate-circular-pdf');

test('section 04 and section 09 are separate navigation and data fields',()=>{
  const html=fs.readFileSync('app.html','utf8'),server=fs.readFileSync('server.js','utf8'),app=fs.readFileSync('assets/app.js','utf8');
  assert.match(html,/data-company-section="04"[^>]*><span>04<\/span> โปรแกรมพนักงาน \/ ครอบครัว/);
  assert.match(html,/data-company-section="09"[^>]*><span>09<\/span> ตารางโปรแกรม/);
  assert.match(html,/id="letter_programConditions"/);
  assert.match(server,/'04':\['programConditions'\]/);
  assert.match(server,/'09':\['hospitalPrograms','familyPrograms'\]/);
  assert.match(app,/programConditions:raw\.programConditions/);
});

test('section 04 narrative and section 09 table both appear in PDF',async()=>{
  const bytes=await buildCorporateCircularPdf({name:'บริษัททดสอบ',year:'2569'},{programConditions:'เงื่อนไขเฉพาะหัวข้อสี่',hospitalPrograms:[{name:'โปรแกรมพนักงานเอ',code:'P1',unitPrice:500}],familyPrograms:[{name:'โปรแกรมครอบครัวบี',code:'F1',unitPrice:300}]});
  const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs'),document=await pdfjs.getDocument({data:new Uint8Array(bytes),disableWorker:true}).promise,text=[];
  for(let i=1;i<=document.numPages;i++)text.push((await (await document.getPage(i)).getTextContent()).items.map(x=>x.str).join(' '));
  assert.match(text[0],/เงื่อนไขเฉพาะหัวข้อสี่/);
  assert.match(text.join(' '),/09 ตารางโปรแกรม/);
  assert.match(text.join(' '),/โปรแกรมพนักงานเอ/);
});
