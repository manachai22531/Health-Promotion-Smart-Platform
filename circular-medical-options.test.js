'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {PDFPage,PDFDocument}=require('pdf-lib');
const {normalizeCircular,buildCorporateCircularPdf}=require('./corporate-circular-pdf');

test('explicit negative medical choices survive normalization without changing legacy defaults',()=>{
  const saved=normalizeCircular({noListenResults:true,noMealCoupon:true});
  assert.equal(saved.noListenResults,true);assert.equal(saved.noMealCoupon,true);
  assert.equal(saved.listenResults,false);assert.equal(saved.mealCoupon,false);
  assert.deepEqual(normalizeCircular(saved),saved);
  const legacy=normalizeCircular({});
  assert.equal(legacy.noListenResults,false);assert.equal(legacy.noMealCoupon,false);
  const conflicting=normalizeCircular({listenResults:true,noListenResults:true,mealCoupon:true,noMealCoupon:true});
  assert.equal(conflicting.noListenResults,false);assert.equal(conflicting.noMealCoupon,false);
});

test('actual PDF includes explicit no-results choice and retains positive and legacy wording',async()=>{
  for(const [item,expected] of [
    [{noListenResults:true,noMealCoupon:true},'ตรวจแบบไม่ฟังผล'],
    [{listenResults:true,mealCoupon:true},'ตรวจแบบฟังผล'],
    [{},'ตรวจตามเงื่อนไขบริษัท']
  ]){
    const texts=[],original=PDFPage.prototype.drawText;
    let bytes;
    try{
      PDFPage.prototype.drawText=function(text,args){texts.push(String(text));return original.call(this,text,args)};
      bytes=await buildCorporateCircularPdf({name:'บริษัททดสอบ',year:'2569'},item);
    }finally{PDFPage.prototype.drawText=original}
    const joined=texts.join('\n');
    assert(joined.includes(expected),expected);
    assert(joined.includes('คูปองอาหาร'));
    assert(texts.includes(item.mealCoupon?'มี':'ไม่มี'));
    assert((await PDFDocument.load(bytes)).getPageCount()>0);
  }
});

test('custom service text survives saving and renders only when Walk in is unchecked',async()=>{
  const serviceFormat='ตรวจสุขภาพนอกสถานที่\nตามนัดหมายบริษัท';
  const saved=normalizeCircular({walkIn:false,serviceFormat:'  '+serviceFormat+'  '});
  assert.equal(saved.serviceFormat,serviceFormat);
  assert.equal(normalizeCircular({serviceFormat:'x'.repeat(1100)}).serviceFormat.length,1000);
  assert.equal(normalizeCircular({}).walkIn,true);
  for(const walkIn of [false,true]){
    const texts=[],original=PDFPage.prototype.drawText;
    try{
      PDFPage.prototype.drawText=function(text,args){texts.push(String(text));return original.call(this,text,args)};
      await buildCorporateCircularPdf({name:'บริษัททดสอบ',year:'2569'},{...saved,walkIn});
    }finally{PDFPage.prototype.drawText=original}
    const joined=texts.join('\n');
    assert.equal(joined.includes('ตรวจสุขภาพนอกสถานที่'),!walkIn);
    assert.equal(joined.includes('ตามนัดหมายบริษัท'),!walkIn);
    assert.equal(joined.includes('Walk in ที่โรงพยาบาลวิมุต'),walkIn);
  }
});
