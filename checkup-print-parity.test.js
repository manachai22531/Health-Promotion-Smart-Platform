'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {columnWidths,buildDocument}=require('./assets/checkup-summary-template');
test('clinical table keeps a compact row number and readable examination column without DOM measurement',()=>{
 const header=['No.','Code','รายการตรวจ','ประเภท','สถานี'];
 const rows=[header,['1','C580','Alkaline Phosphatase','LAB','ห้องเจาะเลือด']];
 const widths=columnWidths('main',rows);
 assert.equal(widths.reduce((a,b)=>a+b,0),100);assert(widths[0]<10);assert(widths[2]>40);
 const html=buildDocument({blocks:[{kind:'main',rows,widths}]});
 assert(html.includes('width:7%'));assert(html.includes('width:46%'));assert(html.includes('Alkaline Phosphatase'));
});
test('reordered clinical headers keep widths attached to the right field',()=>{
 const header=['สถานี','No.','รายการตรวจ','ประเภท','Code'];
 const widths=columnWidths('main',[header]);
 assert.equal(widths[1],7);assert.equal(widths[2],46);assert.equal(widths[4],15);
});
test('billing, cash and contract tables reserve most width for item descriptions',()=>{
 for(const kind of ['billing','cash','contract']){
  const widths=columnWidths(kind,[['1','รายละเอียดรายการตรวจที่ยาว','฿2,200.00']]);
  assert.equal(widths.reduce((a,b)=>a+b,0),100);assert(widths[0]<10);assert(widths[1]>=70);assert(widths[2]>=15);
 }
 assert.deepEqual(columnWidths('main',[]),[]);
});
