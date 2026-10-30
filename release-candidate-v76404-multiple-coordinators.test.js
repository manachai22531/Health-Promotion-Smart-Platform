const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {buildCorporateCircularPdf}=require('./corporate-circular-pdf');

test('coordinators are serialized as name - phone and PDF allows two lines',()=>{
  const app=fs.readFileSync('assets/app.js','utf8');
  const pdf=fs.readFileSync('corporate-circular-pdf.js','utf8');
  assert.match(app,/join\(' - '\)/);
  assert.match(app,/extraCoordinators/);
  assert.match(pdf,/fit\('ผู้ประสานงาน',d\.coordinator,142,191,255,2,6\.5,7\)/);
});

test('generated PDF contains two complete coordinator names and phones',async()=>{
  const bytes=await buildCorporateCircularPdf({name:'บริษัททดสอบ',year:'2569'},{coordinator:'สมชาย ใจดี - 0811111111\nสมหญิง จริงใจ - 0822222222'});
  const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');
  const document=await pdfjs.getDocument({data:new Uint8Array(bytes),disableWorker:true}).promise;
  const content=await (await document.getPage(1)).getTextContent();
  const text=content.items.map(item=>item.str).join(' ');
  assert.match(text,/สมชาย ใจดี - 0811111111/);
  assert.match(text,/สมหญิง จริงใจ - 0822222222/);
});
