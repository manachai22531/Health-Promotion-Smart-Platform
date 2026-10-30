'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const root = __dirname;
const code = fs.readFileSync(path.join(root,'corporate-circular-sections.js'),'utf8');
const css = fs.readFileSync(path.join(root,'assets/style.css'),'utf8');
const html = fs.readFileSync(path.join(root,'app.html'),'utf8');
const collected = [];
const fakePdf = {
  addPage() {
    const page = {
      drawText(value,args){collected.push({text:String(value), ...args});},
      drawLine(){},
      drawRectangle(){},
      drawImage(){}
    };
    return page;
  }
};
const moduleObject={exports:{}};
vm.runInNewContext(code, {
  module:moduleObject,exports:moduleObject.exports,
  require(name){if(name==='pdf-lib')return{rgb:(...a)=>a};throw Error('Invalid dependency')},
  Intl, String, Array, Math, Number
}, {filename:'corporate-circular-sections.js'});
function render() {
  collected.length=0;
  moduleObject.exports.appendAnnualCircularSections(fakePdf, {
    widthOfTextAtSize(s,z){return [...String(s)].length*z*.48}
  },{name:'บริษัททดสอบ 001 จำกัด',year:'2569'}, {
    companyNameEn:'Example Company 001 Ltd.',payorCode:'2342542',payorPlan:'234234234',taxId:'2356256',address:'ที่อยู่บริษัท',
    additionalCompanies:[{name:'บริษัทในเครือ 1',nameEn:'Affiliate One',payorCode:'684654',payorPlan:'6846541',taxId:'777646854',address:'ที่อยู่บริษัทในเครือ'}],
    coordinators:[{name:'สมชาย',phone:'02-123',email:'test@example.com'}],employeeCount:'256'
  });
  return [...collected];
}
test('PDF removes first-page redundant corporate page-summary banner',()=>{
  const drawn=render();
  assert.equal(drawn.some(x=>x.text.includes('สรุปงานขายบริษัทกลุ่ม Corporate')),false);
});
test('PDF main tax ID and address values align with Thai company name value column',()=>{
  const drawn=render();
  const company=drawn.find(x=>x.text==='บริษัททดสอบ 001 จำกัด'&&x.x>70);
  for (const v of ['2356256','ที่อยู่บริษัท']){
    const row=drawn.find(x=>x.text===v && x.x>70);assert.ok(row,`missing ${v}`);
    assert.equal(row.x,company.x,`${v} must start in name value column`);
  }
});
test('PDF affiliate tax ID/address align with subsidiary name',()=>{
  const drawn=render();
  const name=drawn.find(x=>x.text==='บริษัทในเครือ 1'&&x.x>70);
  assert.ok(name,'missing affiliate name');
  for (const v of ['777646854','ที่อยู่บริษัทในเครือ']){
    const row=drawn.find(x=>x.text===v && x.x>70);
    assert.ok(row,`missing ${v}`);
    assert.equal(row.x,name.x,`${v} must align to affiliate name value cell`);
  }
});
test('PDF preserves inline Payor cells on company and affiliate rows',()=>{
  const drawn=render();
  assert.ok(drawn.some(x=>x.text==='Payor Code'));
  assert.ok(drawn.some(x=>x.text==='Payor Plan'));
  assert.ok(drawn.some(x=>x.text==='684654'));
});
test('Annual main and affiliate controls share explicit compact fixed height',()=>{
  const tail=css.slice(css.indexOf('v7.64.19-CORPORATE-ALIGN-R2'));
  assert.ok(tail.includes('.annual-v76419-company-fields input:not([type=hidden])'));
  assert.ok(tail.includes('.annual-v76419-affiliate-fields input:not([type=hidden])'));
  assert.ok(tail.includes('height:34px!important;min-height:34px!important;max-height:34px!important'));
});
test('HTML cache key changes for browser deployment',()=>{
  assert.match(html,/assets\/style\.css\?v=7\.64\.21-production-pdf-bw/);
});
