'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const XLSX=require('./assets/vendor/xlsx.full.min.js');
const importer=require('./assets/company-matrix-import');
const matrix={programs:[{name:'พนักงาน',price:2100},{name:'ครอบครัว',price:5700}],rows:[{no:'1',en:'Physical examination',th:'ตรวจร่างกาย',checks:['yes','na']},{no:'2',en:'CBC',th:'ตรวจเลือด',checks:['blank','yes']}],note:'เงื่อนไขทดสอบ'};
const template=()=>importer.workbook(XLSX,matrix);
test('actual Excel template binary imports Thai, prices, all states and note without loss',()=>{
  const bytes=XLSX.write(template(),{type:'buffer',bookType:'xlsx',compression:true});
  assert.deepEqual(importer.parse(XLSX,XLSX.read(bytes,{type:'buffer',sheetRows:202})),matrix);
});
test('invalid sheets, price and status reject the entire import',()=>{
  let book=template();delete book.Sheets.Programs;assert.throws(()=>importer.parse(XLSX,book),/ไม่พบชีต Programs/);
  book=template();book.Sheets.Programs.B2={t:'n',v:-100};assert.throws(()=>importer.parse(XLSX,book),/ราคาไม่ถูกต้อง/);
  book=template();book.Sheets.Tests.D2={t:'s',v:'maybe'};assert.throws(()=>importer.parse(XLSX,book),/สถานะ/);
  book=template();book.Sheets.Tests.D1={t:'s',v:'wrong column'};assert.throws(()=>importer.parse(XLSX,book),/คอลัมน์/);
});
test('Excel import bounds and orphan status columns fail before truncation',()=>{
  let book=template();book.Sheets.Tests['!ref']='A1:E202';assert.throws(()=>importer.parse(XLSX,book),/เกิน 200/);
  book=template();book.Sheets.Tests.F2={t:'s',v:'✓'};book.Sheets.Tests['!ref']='A1:F3';assert.throws(()=>importer.parse(XLSX,book),/ไม่มีโปรแกรม/);
  book=template();book.Sheets.Programs['!ref']='A1:B12';assert.throws(()=>importer.parse(XLSX,book),/เกิน 10/);
});
