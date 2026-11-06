'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),X=require('./assets/vendor/xlsx.full.min'),M=require('./assets/customer-template-model');
const base=fs.readFileSync('templates/customer-share-base.xlsx');
test('share workbook preserves styles and leading zeros; default rows have no patient/example names or formulas',()=>{
 const bytes=M.build(base,{rows:3,companyName:'=not-a-formula < & บริษัท',year:'2569',locationCode:'001',startDate:'2026-11-06',packageCode:'PK001'}, {locations:[{code:'001',name:'แผนกตัวอย่าง'}],titles:[{code:'T01',name:'นาย'}]},X),wb=X.read(bytes,{type:'array',cellNF:true,cellStyles:true}),s=wb.Sheets['Customer Import'];
 assert.equal(s.A2.v,'=not-a-formula < & บริษัท');assert.equal(s.A2.t,'s');assert(!s.A2.f);assert.equal(s.AE2.v,'001');assert.equal(s.AE2.z,'@');assert.equal(s.E2.v,'06/11/2026');assert.equal(s['!ref'],'A1:AI4');
 assert.equal(s.J2.v,'');assert.equal(s.K2.v,'');assert.equal(s.P2.z,'@');assert.equal(wb.SheetNames.length,6);assert(!M.HEADERS.includes('Password'));
 const zip=X.CFB.read(bytes,{type:'array'}),paths=zip.FullPaths.filter(p=>p.endsWith('.xml'));assert.equal(new Set(paths).size,paths.length);
 const xml=new TextDecoder().decode(X.CFB.find(zip,'/xl/workbook.xml').content);assert(xml.includes("'Title'!$B$2:$B$2"));
 const sheetXml=new TextDecoder().decode(X.CFB.find(zip,'/xl/worksheets/sheet1.xml').content);assert(sheetXml.includes('dataValidations'));assert(sheetXml.includes('sqref="AE2:AE4"'));
});
test('invalid row limits, years, dates and reversed intervals are rejected before export',()=>{
 for(const rows of [0,5001,-1,1.5,'bad'])assert.throws(()=>M.settings({rows}));
 for(const year of ['69','๒๕๖๙','25690'])assert.throws(()=>M.settings({year}));
 assert.throws(()=>M.settings({startDate:'2026-02-30'}));assert.throws(()=>M.settings({startDate:'2026-11-07',endDate:'2026-11-06'}));
 assert.equal(M.dateValue('2024-02-29'),'29/02/2024');assert.equal(M.settings({rows:5000}).rows,5000);
});
