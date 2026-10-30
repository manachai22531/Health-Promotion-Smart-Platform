'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {PDFDocument}=require('pdf-lib');
const {buildCorporateCircularPdf}=require('./corporate-circular-pdf');
test('v7.64.06 identity and visible layouts are complete',()=>{
 assert.equal(require('./package.json').version,'7.64.06');
 assert.match(fs.readFileSync('server.js','utf8'),/v7\.64\.06-production/);
 const app=fs.readFileSync('assets/app.js','utf8'),css=fs.readFileSync('assets/style.css','utf8');
 assert.match(app,/worklistSearchV76401\.after\(worklistRefreshV76401\)/);
 assert.match(app,/search-secondary-row-v76405/);
 assert.match(app,/annual-workspace-divider/);assert.match(css,/cursor:col-resize/);
});
test('generated PDF contains 00-08 continuation then 09 and 10 pages',async()=>{
 const bytes=await buildCorporateCircularPdf({name:'Test Company',year:'2569',billingPackages:[{name:'Extra Lab',quantity:2,unitPrice:100}],cashPackages:[{name:'X-Ray',quantity:1,unitPrice:500}]},{subject:'Annual',hospitalPrograms:[{name:'Employee A',code:'PKG1',unitPrice:1200}],familyPrograms:[{name:'Family A',code:'PKG2',unitPrice:900}],additionalCompanies:[{name:'Child Company'}],appendixDetails:'note'});
 const pdf=await PDFDocument.load(bytes);assert.equal(pdf.getPageCount(),4);
 const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs'),document=await pdfjs.getDocument({data:new Uint8Array(bytes),disableWorker:true}).promise,text=[];
 for(let i=1;i<=document.numPages;i++){const content=await (await document.getPage(i)).getTextContent();text.push(content.items.map(x=>x.str).join(' '))}
 assert.match(text[1],/00-08/);assert.match(text[2],/09/);assert.match(text[3],/10/);
});
test('preview and primary document both merge attachments with page fingerprints',()=>{
 const server=fs.readFileSync('server.js','utf8');assert.match(server,/preview[\s\S]*mergeCompanyAttachmentPdfsV76401/);assert.match(server,/pdfPageFingerprintV76401/);assert.match(server,/duplicatePages/);
});
